"""
Skyra Logger for Python
Canonical ECS-aligned log event validation, serialization, and redaction.
"""

from .types import (
    LogLevel,
    Environment,
    CanonicalEnvironment,
    LegacyEnvironment,
    EventOutcome,
    EcsEvent,
    EcsLog,
    EcsService,
    SkyraMetadata,
    SkyraLogEvent,
    normalize_environment,
    normalize_event_action,
)
from .validator import validate_log_event, ValidationError, normalize_log_event, is_valid_calendar_timestamp
from .parser import parse_strict_json, DuplicateKeyError, parse_jsonl
from .redaction import redact_sensitive_data, audit_sensitive_data, is_sensitive_key, REDACTED_MASK
from .schema import LOG_EVENT_SCHEMA_V1

__all__ = [
    "LogLevel",
    "Environment",
    "CanonicalEnvironment",
    "LegacyEnvironment",
    "EventOutcome",
    "EcsEvent",
    "EcsLog",
    "EcsService",
    "SkyraMetadata",
    "SkyraLogEvent",
    "normalize_environment",
    "normalize_event_action",
    "validate_log_event",
    "normalize_log_event",
    "is_valid_calendar_timestamp",
    "ValidationError",
    "parse_strict_json",
    "DuplicateKeyError",
    "parse_jsonl",
    "redact_sensitive_data",
    "audit_sensitive_data",
    "is_sensitive_key",
    "REDACTED_MASK",
    "LOG_EVENT_SCHEMA_V1",
]
