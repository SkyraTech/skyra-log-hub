"""
Canonical event builder adhering to ECS 8.11.0 and Skyra LogHub v1 schema.
Handles correlation context, duration normalization, deep redaction,
post-redaction envelope locking, and schema validation.
"""

import socket
import traceback
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set

from .config import ResolvedSkyraLoggerConfig
from .context import get_current_context, validate_span_id, validate_trace_id
from .internal.limits import sanitize_message, sanitize_metadata
from .redaction import redact_sensitive_data
from .types import (
    EcsError,
    EcsEvent,
    EcsHost,
    EcsLog,
    EcsService,
    LogLevel,
    SkyraLogEvent,
    SkyraMetadata,
    normalize_environment,
    normalize_event_action,
)
from .validator import validate_log_event, ValidationError

CACHED_HOSTNAME = socket.gethostname() or "unknown-host"

KNOWN_CONTEXT_KEYS: Set[str] = {
    "component",
    "trace_id",
    "traceId",
    "trace",
    "span_id",
    "spanId",
    "span",
    "request_id",
    "requestId",
    "action",
    "outcome",
    "category",
    "type",
    "dataset",
    "duration",
    "duration_ms",
    "durationMs",
    "duration_ns",
    "durationNs",
    "error",
    "labels",
    "tags",
    "http",
    "database",
    "job",
    "user",
    "client",
    "url",
    "user_agent",
    "audit",
    "security",
    "skyra",
    "logger",
}


def scrub_additional_keys(
    target: Any, sensitive_keys: Set[str], seen: Optional[Set[int]] = None
) -> None:
    """
    Recursively scrubs configured additional sensitive keys in place.
    """
    if seen is None:
        seen = set()

    if isinstance(target, dict):
        obj_id = id(target)
        if obj_id in seen:
            return
        seen.add(obj_id)

        for k, v in list(target.items()):
            clean_k = str(k).strip().lower().replace("_", "").replace("-", "").replace(".", "")
            if clean_k in sensitive_keys or str(k).strip().lower() in sensitive_keys:
                target[k] = "[REDACTED]"
            else:
                scrub_additional_keys(v, sensitive_keys, seen)

    elif isinstance(target, list):
        obj_id = id(target)
        if obj_id in seen:
            return
        seen.add(obj_id)

        for item in target:
            scrub_additional_keys(item, sensitive_keys, seen)


def build_canonical_log_event(
    config: ResolvedSkyraLoggerConfig,
    level: LogLevel,
    raw_message: Any,
    metadata: Optional[Dict[str, Any]] = None,
    parent_context: Optional[Dict[str, Any]] = None,
    logger_name: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Builds, redacts, locks, and validates a canonical Skyra Log Event adhering to ECS 8.11.0.
    """
    # 1. UTC Timestamp & UUIDv4 Generation
    now = config.clock()
    if now.tzinfo is None:
        now_utc = now.replace(tzinfo=timezone.utc)
    else:
        now_utc = now.astimezone(timezone.utc)
    timestamp = now_utc.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
    event_id = str(uuid.uuid4())

    # 2. Sanitize and bound top-level message
    message = sanitize_message(raw_message, config.limits.max_message_length)

    # 3. Merge contexts:
    # Context Priority: active contextvars -> parent child context -> call-site metadata
    merged: Dict[str, Any] = {}
    active_ctx = get_current_context()
    if active_ctx:
        merged.update(active_ctx)
    if parent_context:
        merged.update(parent_context)
    if metadata:
        merged.update(metadata)

    # 4. Sanitize context objects against limits (depth, array length, object entries, circular refs)
    sanitized: Dict[str, Any] = sanitize_metadata(merged, config.limits) or {}

    # 5. ECS event section
    event_action = (
        normalize_event_action(str(sanitized["action"]))
        if "action" in sanitized and sanitized["action"] is not None
        else None
    )

    event_section: EcsEvent = {
        "id": event_id,
    }
    if event_action:
        event_section["action"] = event_action
    if "outcome" in sanitized and sanitized["outcome"] in ("success", "failure", "unknown"):
        event_section["outcome"] = sanitized["outcome"]  # type: ignore
    if "category" in sanitized and isinstance(sanitized["category"], list):
        event_section["category"] = [str(c) for c in sanitized["category"]]
    if "type" in sanitized and isinstance(sanitized["type"], list):
        event_section["type"] = [str(t) for t in sanitized["type"]]
    if "dataset" in sanitized and sanitized["dataset"] is not None:
        event_section["dataset"] = str(sanitized["dataset"])

    # Duration normalization (nanoseconds in ECS, milliseconds in skyra)
    duration_ns: Optional[int] = None
    duration_ms: Optional[float] = None

    raw_dur_ms = sanitized.get("duration_ms") or sanitized.get("durationMs")
    raw_dur_ns = sanitized.get("duration_ns") or sanitized.get("durationNs")
    raw_dur = sanitized.get("duration")

    if isinstance(raw_dur_ms, (int, float)) and raw_dur_ms >= 0:
        duration_ms = float(raw_dur_ms)
        duration_ns = int(round(duration_ms * 1_000_000))
    elif isinstance(raw_dur_ns, (int, float)) and raw_dur_ns >= 0:
        duration_ns = int(raw_dur_ns)
        duration_ms = round(duration_ns / 1_000_000.0, 3)
    elif isinstance(raw_dur, (int, float)) and raw_dur >= 0:
        if raw_dur > 100_000:
            duration_ns = int(raw_dur)
            duration_ms = round(duration_ns / 1_000_000.0, 3)
        else:
            duration_ms = float(raw_dur)
            duration_ns = int(round(duration_ms * 1_000_000))

    if duration_ns is not None:
        event_section["duration"] = duration_ns

    # 6. Service section
    service_section: EcsService = {
        "name": config.service_name,
        "environment": normalize_environment(config.environment),
    }
    if config.service_version:
        service_section["version"] = config.service_version
    if config.node_name:
        service_section["node"] = {"name": config.node_name}  # type: ignore

    # 7. Skyra metadata section
    skyra_section: SkyraMetadata = {
        "project_id": config.project_id,
        "schema_version": "1.0",
    }
    if "component" in sanitized and sanitized["component"] is not None:
        skyra_section["component"] = str(sanitized["component"])
    if duration_ms is not None:
        skyra_section["duration_ms"] = duration_ms

    # 8. Log section
    log_name = (
        logger_name
        or (str(sanitized.get("logger")) if sanitized.get("logger") else None)
        or config.service_name
    )
    log_section: EcsLog = {
        "level": level,
        "logger": log_name,
    }

    # 9. Host section
    host_section: EcsHost = {
        "hostname": CACHED_HOSTNAME,
        "name": CACHED_HOSTNAME,
    }

    # 10. Error handling
    error_section: Optional[EcsError] = None
    raw_error = sanitized.get("error")
    if raw_error is not None:
        if isinstance(raw_error, dict):
            error_section = {
                "type": str(raw_error.get("type", "Error")),
                "message": str(raw_error.get("message", "An error occurred")),
            }
            if "code" in raw_error:
                error_section["code"] = raw_error["code"]
            if "stack_trace" in raw_error:
                error_section["stack_trace"] = str(raw_error["stack_trace"])
        elif isinstance(raw_error, Exception):
            stack = "".join(traceback.format_exception(type(raw_error), raw_error, raw_error.__traceback__))
            error_section = {
                "type": type(raw_error).__name__,
                "message": str(raw_error),
                "stack_trace": stack,
            }
            if hasattr(raw_error, "code"):
                error_section["code"] = getattr(raw_error, "code")
        else:
            error_section = {
                "type": "Error",
                "message": str(raw_error),
            }

    # 11. Optional Tracing (Strict W3C validation: 32 hex trace ID, 16 hex span ID, non-zero)
    raw_trace_id = sanitized.get("trace_id") or sanitized.get("traceId")
    if not raw_trace_id and isinstance(sanitized.get("trace"), dict):
        raw_trace_id = sanitized["trace"].get("id")
    valid_trace = validate_trace_id(raw_trace_id)

    raw_span_id = sanitized.get("span_id") or sanitized.get("spanId")
    if not raw_span_id and isinstance(sanitized.get("span"), dict):
        raw_span_id = sanitized["span"].get("id")
    valid_span = validate_span_id(raw_span_id)

    # 12. Assembling canonical event candidate
    canonical_event: Dict[str, Any] = {
        "@timestamp": timestamp,
        "ecs.version": "8.11.0",
        "event": event_section,
        "log": log_section,
        "message": message,
        "service": service_section,
        "skyra": skyra_section,
        "host": host_section,
    }

    if valid_trace:
        canonical_event["trace"] = {"id": valid_trace}
    if valid_span:
        canonical_event["span"] = {"id": valid_span}
    if error_section:
        canonical_event["error"] = error_section

    # 13. Optional ECS Subsections
    for field in ("http", "database", "job", "user", "client", "url", "user_agent"):
        if field in sanitized and isinstance(sanitized[field], dict):
            canonical_event[field] = sanitized[field]

    if "labels" in sanitized and isinstance(sanitized["labels"], dict):
        canonical_event["labels"] = {str(k): str(v) for k, v in sanitized["labels"].items()}

    if "tags" in sanitized and isinstance(sanitized["tags"], list):
        canonical_event["tags"] = [str(t) for t in sanitized["tags"]]

    # 14. Custom business metadata
    custom_business: Dict[str, Any] = {}
    for k, v in sanitized.items():
        if k not in KNOWN_CONTEXT_KEYS:
            custom_business[k] = v

    if "audit" in sanitized and isinstance(sanitized["audit"], dict):
        skyra_section["audit"] = sanitized["audit"]
    if "security" in sanitized and isinstance(sanitized["security"], dict):
        skyra_section["security"] = sanitized["security"]
    if "skyra" in sanitized and isinstance(sanitized["skyra"], dict):
        raw_skyra = sanitized["skyra"]
        for subfield in ("http", "db", "job", "audit", "security"):
            if subfield in raw_skyra and isinstance(raw_skyra[subfield], dict):
                skyra_section[subfield] = raw_skyra[subfield]  # type: ignore

    if custom_business:
        skyra_section["business"] = custom_business

    # 15. Deep Sensitive Data Redaction
    redacted = redact_sensitive_data(canonical_event)

    # 16. Scrub Additional Sensitive Keys if configured
    if config.additional_sensitive_keys:
        clean_keys = {k.strip().lower().replace("_", "").replace("-", "").replace(".", "") for k in config.additional_sensitive_keys}
        scrub_additional_keys(redacted, clean_keys)

    # 17. Invariant Post-Redaction Envelope Defense:
    # Mandatory envelope fields must never be overridden or corrupted by user metadata or redaction
    redacted["@timestamp"] = timestamp
    redacted["ecs.version"] = "8.11.0"
    redacted["event"]["id"] = event_id
    redacted["log"]["level"] = level
    redacted["service"]["name"] = config.service_name
    redacted["service"]["environment"] = normalize_environment(config.environment)
    redacted["skyra"]["project_id"] = config.project_id
    redacted["skyra"]["schema_version"] = "1.0"
    if valid_trace:
        redacted["trace"] = {"id": valid_trace}
    if valid_span:
        redacted["span"] = {"id": valid_span}

    # 18. Strict validation against canonical schema
    is_valid, errors = validate_log_event(redacted)
    if not is_valid:
        raise ValidationError(errors)

    return redacted
