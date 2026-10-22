"""
Background job execution timer instrumentation.
Emits canonical ECS and Skyra job metadata with monotonic duration tracking.
"""

import inspect
import time
from typing import Any, Callable, Dict, Optional, TypeVar

T = TypeVar("T")


def measure_job(
    logger: Any,
    name: str,
    function: Callable[[], T],
    job_id: Optional[str] = None,
    queue: Optional[str] = None,
    attempt: Optional[int] = None,
    max_attempts: Optional[int] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> T:
    """
    Synchronously measures monotonic execution time of a background job or task.
    Emits job.execution.completed on success, or job.execution.failed on exception.
    Re-raises original exceptions without modification.
    """
    start_ns = time.perf_counter_ns()
    job_meta: Dict[str, Any] = {
        "name": name,
    }
    if job_id:
        job_meta["id"] = job_id
    if queue:
        job_meta["queue"] = queue
    if attempt is not None:
        job_meta["attempt"] = attempt
    if max_attempts is not None:
        job_meta["max_attempts"] = max_attempts

    base_meta: Dict[str, Any] = {
        "category": ["job"],
        "job": job_meta,
    }
    if metadata:
        base_meta.update(metadata)

    try:
        result = function()
        duration_ns = time.perf_counter_ns() - start_ns
        duration_ms = round(duration_ns / 1_000_000.0, 3)

        success_meta = dict(base_meta)
        success_meta.update({
            "action": "job.execution.completed",
            "outcome": "success",
            "duration_ms": duration_ms,
            "duration_ns": duration_ns,
        })

        logger.info(f"Job '{name}' completed in {duration_ms}ms", success_meta)
        return result

    except Exception as exc:
        duration_ns = time.perf_counter_ns() - start_ns
        duration_ms = round(duration_ns / 1_000_000.0, 3)

        fail_meta = dict(base_meta)
        fail_meta.update({
            "action": "job.execution.failed",
            "outcome": "failure",
            "duration_ms": duration_ms,
            "duration_ns": duration_ns,
            "error": exc,
        })

        logger.error(f"Job '{name}' failed after {duration_ms}ms: {exc}", fail_meta)
        raise


async def measure_job_async(
    logger: Any,
    name: str,
    function: Callable[[], Any],
    job_id: Optional[str] = None,
    queue: Optional[str] = None,
    attempt: Optional[int] = None,
    max_attempts: Optional[int] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> Any:
    """
    Asynchronously measures monotonic execution time of a background job or task.
    """
    start_ns = time.perf_counter_ns()
    job_meta: Dict[str, Any] = {
        "name": name,
    }
    if job_id:
        job_meta["id"] = job_id
    if queue:
        job_meta["queue"] = queue
    if attempt is not None:
        job_meta["attempt"] = attempt
    if max_attempts is not None:
        job_meta["max_attempts"] = max_attempts

    base_meta: Dict[str, Any] = {
        "category": ["job"],
        "job": job_meta,
    }
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
            "action": "job.execution.completed",
            "outcome": "success",
            "duration_ms": duration_ms,
            "duration_ns": duration_ns,
        })

        logger.info(f"Job '{name}' completed in {duration_ms}ms", success_meta)
        return result

    except Exception as exc:
        duration_ns = time.perf_counter_ns() - start_ns
        duration_ms = round(duration_ns / 1_000_000.0, 3)

        fail_meta = dict(base_meta)
        fail_meta.update({
            "action": "job.execution.failed",
            "outcome": "failure",
            "duration_ms": duration_ms,
            "duration_ns": duration_ns,
            "error": exc,
        })

        logger.error(f"Job '{name}' failed after {duration_ms}ms: {exc}", fail_meta)
        raise
