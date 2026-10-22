"""
Database query and transaction execution timer instrumentation.
Emits canonical ECS and Skyra metadata with monotonic duration tracking.
"""

import inspect
import time
from typing import Any, Callable, Dict, Optional, TypeVar

T = TypeVar("T")


def measure_database(
    logger: Any,
    system: str,
    operation: str,
    function: Callable[[], T],
    name: Optional[str] = None,
    table: Optional[str] = None,
    statement_sanitized: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> T:
    """
    Synchronously measures monotonic elapsed execution time of a database operation.
    Emits database.query.completed on success, or database.query.failed on exception.
    Re-raises original exceptions without modification.
    """
    start_ns = time.perf_counter_ns()
    db_meta: Dict[str, Any] = {
        "system": system,
        "operation": operation,
    }
    if name:
        db_meta["name"] = name
    if table:
        db_meta["table"] = table
    if statement_sanitized:
        db_meta["statement_sanitized"] = statement_sanitized

    base_meta: Dict[str, Any] = {
        "category": ["database"],
        "database": db_meta,
    }
    if metadata:
        base_meta.update(metadata)

    try:
        result = function()
        duration_ns = time.perf_counter_ns() - start_ns
        duration_ms = round(duration_ns / 1_000_000.0, 3)

        success_meta = dict(base_meta)
        success_meta.update({
            "action": "database.query.completed",
            "outcome": "success",
            "duration_ms": duration_ms,
            "duration_ns": duration_ns,
        })

        query_desc = f" ({table})" if table else (f" ({name})" if name else "")
        logger.info(f"Database {operation}{query_desc} completed in {duration_ms}ms", success_meta)
        return result

    except Exception as exc:
        duration_ns = time.perf_counter_ns() - start_ns
        duration_ms = round(duration_ns / 1_000_000.0, 3)

        fail_meta = dict(base_meta)
        fail_meta.update({
            "action": "database.query.failed",
            "outcome": "failure",
            "duration_ms": duration_ms,
            "duration_ns": duration_ns,
            "error": exc,
        })

        query_desc = f" ({table})" if table else (f" ({name})" if name else "")
        logger.error(f"Database {operation}{query_desc} failed after {duration_ms}ms: {exc}", fail_meta)
        raise


async def measure_database_async(
    logger: Any,
    system: str,
    operation: str,
    function: Callable[[], Any],
    name: Optional[str] = None,
    table: Optional[str] = None,
    statement_sanitized: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> Any:
    """
    Asynchronously measures monotonic elapsed execution time of a database operation.
    """
    start_ns = time.perf_counter_ns()
    db_meta: Dict[str, Any] = {
        "system": system,
        "operation": operation,
    }
    if name:
        db_meta["name"] = name
    if table:
        db_meta["table"] = table
    if statement_sanitized:
        db_meta["statement_sanitized"] = statement_sanitized

    base_meta: Dict[str, Any] = {
        "category": ["database"],
        "database": db_meta,
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
            "action": "database.query.completed",
            "outcome": "success",
            "duration_ms": duration_ms,
            "duration_ns": duration_ns,
        })

        query_desc = f" ({table})" if table else (f" ({name})" if name else "")
        logger.info(f"Database {operation}{query_desc} completed in {duration_ms}ms", success_meta)
        return result

    except Exception as exc:
        duration_ns = time.perf_counter_ns() - start_ns
        duration_ms = round(duration_ns / 1_000_000.0, 3)

        fail_meta = dict(base_meta)
        fail_meta.update({
            "action": "database.query.failed",
            "outcome": "failure",
            "duration_ms": duration_ms,
            "duration_ns": duration_ns,
            "error": exc,
        })

        query_desc = f" ({table})" if table else (f" ({name})" if name else "")
        logger.error(f"Database {operation}{query_desc} failed after {duration_ms}ms: {exc}", fail_meta)
        raise
