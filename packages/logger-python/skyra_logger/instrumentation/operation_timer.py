"""
Generic operation timing instrumentation helper.
"""

import inspect
import time
from typing import Any, Callable, Dict, Optional, TypeVar

from ..types import normalize_event_action

T = TypeVar("T")


def measure_operation(
    logger: Any,
    action: str,
    function: Callable[[], T],
    metadata: Optional[Dict[str, Any]] = None,
) -> T:
    """
    Synchronously measures monotonic elapsed time of an arbitrary business or pipeline operation.
    """
    start_ns = time.perf_counter_ns()
    canonical_action = normalize_event_action(action)

    base_meta: Dict[str, Any] = {}
    if metadata:
        base_meta.update(metadata)

    try:
        result = function()
        duration_ns = time.perf_counter_ns() - start_ns
        duration_ms = round(duration_ns / 1_000_000.0, 3)

        success_meta = dict(base_meta)
        success_meta.update({
            "action": canonical_action,
            "outcome": "success",
            "duration_ms": duration_ms,
            "duration_ns": duration_ns,
        })

        logger.info(f"Operation '{canonical_action}' completed in {duration_ms}ms", success_meta)
        return result

    except Exception as exc:
        duration_ns = time.perf_counter_ns() - start_ns
        duration_ms = round(duration_ns / 1_000_000.0, 3)

        fail_meta = dict(base_meta)
        fail_meta.update({
            "action": canonical_action,
            "outcome": "failure",
            "duration_ms": duration_ms,
            "duration_ns": duration_ns,
            "error": exc,
        })

        logger.error(f"Operation '{canonical_action}' failed after {duration_ms}ms: {exc}", fail_meta)
        raise


async def measure_operation_async(
    logger: Any,
    action: str,
    function: Callable[[], Any],
    metadata: Optional[Dict[str, Any]] = None,
) -> Any:
    """
    Asynchronously measures monotonic elapsed time of an arbitrary business or pipeline operation.
    """
    start_ns = time.perf_counter_ns()
    canonical_action = normalize_event_action(action)

    base_meta: Dict[str, Any] = {}
    if metadata:
        base_meta.update(metadata)

    try:
        res = function()
        if inspect.isawaitable(res):
            result = await res
        else:
            result = res

        duration_ns = time.perf_counter_ns() - start_ns
        duration_ms = round(duration_ns / 1_000_000.0, 3)

        success_meta = dict(base_meta)
        success_meta.update({
            "action": canonical_action,
            "outcome": "success",
            "duration_ms": duration_ms,
            "duration_ns": duration_ns,
        })

        logger.info(f"Operation '{canonical_action}' completed in {duration_ms}ms", success_meta)
        return result

    except Exception as exc:
        duration_ns = time.perf_counter_ns() - start_ns
        duration_ms = round(duration_ns / 1_000_000.0, 3)

        fail_meta = dict(base_meta)
        fail_meta.update({
            "action": canonical_action,
            "outcome": "failure",
            "duration_ms": duration_ms,
            "duration_ns": duration_ns,
            "error": exc,
        })

        logger.error(f"Operation '{canonical_action}' failed after {duration_ms}ms: {exc}", fail_meta)
        raise
