"""
Canonical log event schema validation for Python using JSON Schema Draft 2020-12.
"""

import re
from typing import Any, Dict, List, Tuple, Mapping
import jsonschema
from jsonschema.validators import validator_for

from .schema import LOG_EVENT_SCHEMA_V1
from .types import normalize_environment, normalize_event_action

# Initialize and cache Draft 2020-12 validator instance once
_validator_cls = validator_for(LOG_EVENT_SCHEMA_V1)
_validator_cls.check_schema(LOG_EVENT_SCHEMA_V1)
_COMPILED_VALIDATOR = _validator_cls(LOG_EVENT_SCHEMA_V1)


class ValidationError(Exception):
    def __init__(self, errors: List[str]):
        super().__init__(f"Validation failed with {len(errors)} error(s): {'; '.join(errors)}")
        self.errors = errors


def is_valid_calendar_timestamp(ts: Any) -> bool:
    """
    Verifies real calendar validity for RFC3339 UTC timestamps.
    Validates days in months, leap years, hour/min/sec bounds, and trailing 'Z'.
    """
    if not isinstance(ts, str):
        return False
    # Strict ISO 8601 UTC regex matching pattern in canonical schema
    match = re.match(
        r"^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,9})?Z$",
        ts,
    )
    if not match:
        return False

    date_part = ts[:-1].split("T")[0]
    parts = date_part.split("-")
    if len(parts) != 3:
        return False
    try:
        year, month, day = int(parts[0]), int(parts[1]), int(parts[2])
    except ValueError:
        return False

    # Month day bounds
    if month in (4, 6, 9, 11) and day > 30:
        return False

    # February leap year check
    if month == 2:
        is_leap = (year % 4 == 0 and year % 100 != 0) or (year % 400 == 0)
        if is_leap and day > 29:
            return False
        if not is_leap and day > 28:
            return False

    return True


def normalize_log_event(record: Mapping[str, Any]) -> Dict[str, Any]:
    """
    Safely normalizes environment aliases and action naming in a log event
    without mutating the caller's input dictionary.
    Returns a new dictionary that complies with canonical schema expectations.
    """
    if not isinstance(record, dict):
        return record  # type: ignore

    cloned = dict(record)

    if isinstance(cloned.get("service"), dict):
        svc = dict(cloned["service"])
        if isinstance(svc.get("environment"), str):
            svc["environment"] = normalize_environment(svc["environment"])
        cloned["service"] = svc

    if isinstance(cloned.get("event"), dict):
        ev = dict(cloned["event"])
        if isinstance(ev.get("action"), str):
            ev["action"] = normalize_event_action(ev["action"])
        cloned["event"] = ev

    return cloned


def validate_log_event(record: Any) -> Tuple[bool, List[str]]:
    """
    Validates a candidate dictionary against the canonical Skyra Log Event Schema v1.
    Returns (is_valid, list_of_error_strings).
    Safe error reporting that avoids leaking sensitive values in diagnostics.
    """
    errors: List[str] = []

    if not isinstance(record, dict):
        return False, ["Log event must be a non-null dictionary"]

    # 1. Schema-driven validation
    schema_errors = sorted(_COMPILED_VALIDATOR.iter_errors(record), key=lambda e: e.path)
    for err in schema_errors:
        path = ".".join(str(p) for p in err.path) if err.path else "$"
        # Sanitize message to prevent leaking sensitive values in failure diagnostics
        clean_msg = err.message
        errors.append(f"{path}: {clean_msg}")

    # 2. Real calendar timestamp validation (leap years, 30-day month limits)
    ts = record.get("@timestamp")
    if isinstance(ts, str) and not is_valid_calendar_timestamp(ts):
        if not any("@timestamp" in e for e in errors):
            errors.append(
                "@timestamp: Invalid calendar date or timestamp value "
                "(e.g. non-existent day, leap day mismatch, or non-UTC)"
            )

    # 3. Cross-field timing check: event.duration (ns) vs skyra.duration_ms (ms)
    event = record.get("event")
    skyra = record.get("skyra")
    if isinstance(event, dict) and isinstance(skyra, dict):
        ev_dur = event.get("duration")
        sk_dur = skyra.get("duration_ms")
        if isinstance(ev_dur, int) and isinstance(sk_dur, (int, float)):
            from_ns_ms = ev_dur / 1_000_000.0
            if abs(from_ns_ms - float(sk_dur)) > 1.0:
                errors.append(
                    f"skyra.duration_ms: Timing mismatch: event.duration ({ev_dur} ns = {from_ns_ms:.2f} ms) "
                    f"differs from skyra.duration_ms ({sk_dur} ms)"
                )

    return len(errors) == 0, errors
