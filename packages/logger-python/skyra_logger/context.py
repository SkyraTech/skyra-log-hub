"""
Request and trace correlation context propagation using Python contextvars.
Supports nested scopes, async execution, W3C trace validation, and non-leaking isolation.
"""

import re
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Any, Dict, Iterator, Optional

# Context variable storing the active correlation dictionary
_current_context: ContextVar[Dict[str, Any]] = ContextVar("skyra_current_context", default={})

W3C_TRACE_REGEX = re.compile(r"^[0-9a-fA-F]{32}$")
W3C_SPAN_REGEX = re.compile(r"^[0-9a-fA-F]{16}$")
ZERO_TRACE = "00000000000000000000000000000000"
ZERO_SPAN = "0000000000000000"


def validate_trace_id(trace_id: Any) -> Optional[str]:
    """
    Validates W3C trace ID: 32 hex characters, not all zeros.
    Returns normalized lowercase hex string or None if invalid.
    """
    if not isinstance(trace_id, str):
        return None
    clean = trace_id.strip()
    if clean == ZERO_TRACE or not W3C_TRACE_REGEX.match(clean):
        return None
    return clean.lower()


def validate_span_id(span_id: Any) -> Optional[str]:
    """
    Validates W3C span ID: 16 hex characters, not all zeros.
    Returns normalized lowercase hex string or None if invalid.
    """
    if not isinstance(span_id, str):
        return None
    clean = span_id.strip()
    if clean == ZERO_SPAN or not W3C_SPAN_REGEX.match(clean):
        return None
    return clean.lower()


def get_current_context() -> Dict[str, Any]:
    """
    Returns a shallow copy of the active correlation context.
    """
    return dict(_current_context.get())


def set_current_context(context: Dict[str, Any]) -> None:
    """
    Directly sets the active correlation context.
    """
    _current_context.set(dict(context))


def clear_current_context() -> None:
    """
    Clears the active correlation context.
    """
    _current_context.set({})


@contextmanager
def skyra_context(**kwargs: Any) -> Iterator[Dict[str, Any]]:
    """
    Context manager for correlation context propagation.
    Merges kwargs into parent context, restores parent context on exit.
    Safely validates W3C trace/span identifiers if supplied.
    """
    parent = _current_context.get()
    new_context = dict(parent)

    # Process and validate kwargs
    for k, v in kwargs.items():
        if v is None:
            new_context.pop(k, None)
            continue

        if k in ("trace_id", "traceId"):
            valid_trace = validate_trace_id(v)
            if valid_trace:
                new_context["trace_id"] = valid_trace
                new_context["traceId"] = valid_trace
            else:
                # Omit invalid trace ID
                new_context.pop("trace_id", None)
                new_context.pop("traceId", None)
        elif k in ("span_id", "spanId"):
            valid_span = validate_span_id(v)
            if valid_span:
                new_context["span_id"] = valid_span
                new_context["spanId"] = valid_span
            else:
                new_context.pop("span_id", None)
                new_context.pop("spanId", None)
        elif k in ("request_id", "requestId"):
            new_context["request_id"] = str(v)
            new_context["requestId"] = str(v)
        else:
            new_context[k] = v

    token = _current_context.set(new_context)
    try:
        yield new_context
    finally:
        _current_context.reset(token)
