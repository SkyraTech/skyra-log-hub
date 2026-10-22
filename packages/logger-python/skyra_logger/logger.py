"""
Primary SkyraLogger interface and factory.
Consistent with the @skyra/logger-node API surface while integrating
with Python concurrency, contextvars, and standard library patterns.
"""

import threading
from typing import Any, Callable, Dict, List, Optional, Set, Union

from .config import (
    FileTransportConfig,
    ResolvedSkyraLoggerConfig,
    ResourceLimits,
    StdoutTransportConfig,
    TransportConfig,
    resolve_config,
)
from .event_builder import build_canonical_log_event
from .formatter import format_jsonl_event
from .handlers.jsonl_file import JsonlFileTransport
from .handlers.stdout import StdoutTransport
from .instrumentation.database_timer import measure_database, measure_database_async
from .instrumentation.job_timer import measure_job, measure_job_async
from .instrumentation.operation_timer import measure_operation, measure_operation_async
from .internal.diagnostics import emit_internal_diagnostic
from .internal.write_queue import QueueItem, WriteQueue
from .types import LogLevel

SEVERITY_ORDER: Dict[LogLevel, int] = {
    "fatal": 0,
    "error": 1,
    "warn": 2,
    "info": 3,
    "debug": 4,
    "trace": 5,
}


class SkyraLogger:
    """
    Production-grade structured logger emitting canonical ECS-compliant events.
    Thread-safe, bounded-memory, single-writer isolated, and asynchronous.
    """

    def __init__(
        self,
        config: ResolvedSkyraLoggerConfig,
        transport: Optional[Union[JsonlFileTransport, StdoutTransport]] = None,
        write_queue: Optional[WriteQueue] = None,
        parent_context: Optional[Dict[str, Any]] = None,
    ):
        self.config = config
        self.parent_context = parent_context or {}
        self._current_level_val = SEVERITY_ORDER.get(config.level, SEVERITY_ORDER["info"])
        self._is_closed = False
        self._lock = threading.Lock()
        self._total_events_submitted = 0

        # Instantiate physical transport
        if transport:
            self.transport = transport
        else:
            if isinstance(config.transport, FileTransportConfig):
                self.transport = JsonlFileTransport(config, config.transport)
            else:
                self.transport = StdoutTransport()

        # Instantiate bounded write queue
        if write_queue:
            self.write_queue = write_queue
        else:
            self.write_queue = WriteQueue(
                limits=config.limits,
                write_handler=self._handle_write_batch,
                on_drop=config.on_drop,
            )

    def _handle_write_batch(self, items: List[QueueItem]) -> None:
        """Flushes a batch of queued items to the physical transport."""
        for item in items:
            try:
                self.transport.write(item.level, item.line, item.byte_count)
            except Exception as err:
                if self.config.on_error:
                    try:
                        self.config.on_error(err)
                    except Exception:
                        pass
                emit_internal_diagnostic("TransportWriteError", f"Physical transport failed: {err}", err)

    def log(self, level: LogLevel, message: Any, metadata: Optional[Dict[str, Any]] = None) -> None:
        """
        Emits a structured log event if severity meets or exceeds configured threshold.
        """
        target_val = SEVERITY_ORDER.get(level, SEVERITY_ORDER["info"])
        if target_val > self._current_level_val:
            return  # Filtered by log level

        with self._lock:
            if self._is_closed:
                emit_internal_diagnostic("LoggerClosed", f"Write attempted after logger closed: level='{level}'")
                return
            self._total_events_submitted += 1

        try:
            # Build validated, canonical, redacted event
            canonical_event = build_canonical_log_event(
                config=self.config,
                level=level,
                raw_message=message,
                metadata=metadata,
                parent_context=self.parent_context,
            )

            # Format into JSONL line
            line = format_jsonl_event(canonical_event)

            # Enqueue for background physical writing
            self.write_queue.enqueue(level, line)

        except Exception as err:
            if self.config.on_error:
                try:
                    self.config.on_error(err)
                except Exception:
                    pass
            emit_internal_diagnostic("EventBuildError", f"Failed to build log event: {err}", err)

    def trace(self, message: Any, metadata: Optional[Dict[str, Any]] = None) -> None:
        self.log("trace", message, metadata)

    def debug(self, message: Any, metadata: Optional[Dict[str, Any]] = None) -> None:
        self.log("debug", message, metadata)

    def info(self, message: Any, metadata: Optional[Dict[str, Any]] = None) -> None:
        self.log("info", message, metadata)

    def warn(self, message: Any, metadata: Optional[Dict[str, Any]] = None) -> None:
        self.log("warn", message, metadata)

    def error(self, message: Any, metadata: Optional[Dict[str, Any]] = None) -> None:
        self.log("error", message, metadata)

    def fatal(self, message: Any, metadata: Optional[Dict[str, Any]] = None) -> None:
        self.log("fatal", message, metadata)

    def exception(self, message: Any, exc: Optional[Exception] = None, metadata: Optional[Dict[str, Any]] = None) -> None:
        """Helper to log an error with an attached exception."""
        meta = dict(metadata or {})
        if exc is not None:
            meta["error"] = exc
        self.log("error", message, meta)

    def child(self, context: Dict[str, Any]) -> "SkyraLogger":
        """
        Creates a child logger sharing the same underlying transport and queue,
        with merged contextual metadata automatically appended to all emitted events.
        """
        merged_child_context = dict(self.parent_context)
        if context:
            merged_child_context.update(context)

        return SkyraLogger(
            config=self.config,
            transport=self.transport,
            write_queue=self.write_queue,
            parent_context=merged_child_context,
        )

    def flush(self, timeout: float = 30.0) -> None:
        """
        Flushes all in-memory queued events and forces physical durability (fsync).
        """
        self.write_queue.flush(timeout=timeout)
        self.transport.flush()

    def close(self, timeout: float = 30.0) -> None:
        """
        Gracefully flushes pending events, closes the queue, and finalizes the physical transport.
        Idempotent: safe to call multiple times.
        """
        with self._lock:
            if self._is_closed:
                return
            self._is_closed = True

        self.write_queue.close(timeout=timeout)
        self.transport.close()

    def get_status(self) -> Dict[str, Any]:
        """Returns observable health and throughput metrics."""
        transport_status = self.transport.get_status()
        with self._lock:
            return {
                "project_id": self.config.project_id,
                "service_name": self.config.service_name,
                "environment": self.config.environment,
                "instance_id": self.config.instance_id,
                "level": self.config.level,
                "is_closed": self._is_closed,
                "total_events_submitted": self._total_events_submitted,
                "total_events_accepted": self.write_queue.accepted_count,
                "total_events_dropped": self.write_queue.dropped_count,
                "pending_queue_count": self.write_queue.pending_count,
                "pending_queue_bytes": self.write_queue.pending_bytes,
                "total_events_written": transport_status.get("total_events_written", 0),
                "total_bytes_written": transport_status.get("total_bytes_written", 0),
                "total_events_fsynced": transport_status.get("total_events_fsynced", 0),
                "active_file": transport_status.get("active_file"),
            }

    # Context Manager Support
    def __enter__(self) -> "SkyraLogger":
        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        self.flush()
        self.close()

    # Reusable Instrumentation Helpers
    def measure_database(
        self,
        system: str,
        operation: str,
        function: Callable[[], Any],
        name: Optional[str] = None,
        table: Optional[str] = None,
        statement_sanitized: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Any:
        return measure_database(
            self,
            system=system,
            operation=operation,
            function=function,
            name=name,
            table=table,
            statement_sanitized=statement_sanitized,
            metadata=metadata,
        )

    async def measure_database_async(
        self,
        system: str,
        operation: str,
        function: Callable[[], Any],
        name: Optional[str] = None,
        table: Optional[str] = None,
        statement_sanitized: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Any:
        return await measure_database_async(
            self,
            system=system,
            operation=operation,
            function=function,
            name=name,
            table=table,
            statement_sanitized=statement_sanitized,
            metadata=metadata,
        )

    def measure_job(
        self,
        name: str,
        function: Callable[[], Any],
        job_id: Optional[str] = None,
        queue: Optional[str] = None,
        attempt: Optional[int] = None,
        max_attempts: Optional[int] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Any:
        return measure_job(
            self,
            name=name,
            function=function,
            job_id=job_id,
            queue=queue,
            attempt=attempt,
            max_attempts=max_attempts,
            metadata=metadata,
        )

    async def measure_job_async(
        self,
        name: str,
        function: Callable[[], Any],
        job_id: Optional[str] = None,
        queue: Optional[str] = None,
        attempt: Optional[int] = None,
        max_attempts: Optional[int] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Any:
        return await measure_job_async(
            self,
            name=name,
            function=function,
            job_id=job_id,
            queue=queue,
            attempt=attempt,
            max_attempts=max_attempts,
            metadata=metadata,
        )

    def measure_operation(
        self,
        action: str,
        function: Callable[[], Any],
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Any:
        return measure_operation(self, action=action, function=function, metadata=metadata)

    async def measure_operation_async(
        self,
        action: str,
        function: Callable[[], Any],
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Any:
        return await measure_operation_async(self, action=action, function=function, metadata=metadata)


def create_skyra_logger(
    project_id: str,
    service_name: str,
    environment: Optional[str] = None,
    instance_id: Optional[str] = None,
    level: str = "info",
    service_version: Optional[str] = None,
    node_name: Optional[str] = None,
    transport: Optional[Union[Dict[str, Any], TransportConfig]] = None,
    fsync_on_levels: Optional[Union[List[str], Set[str]]] = None,
    additional_sensitive_keys: Optional[List[str]] = None,
    limits: Optional[Union[Dict[str, Any], ResourceLimits]] = None,
    clock: Optional[Callable[[], Any]] = None,
    on_error: Optional[Callable[[Exception], None]] = None,
    on_drop: Optional[Callable[[int, str], None]] = None,
) -> SkyraLogger:
    """
    Factory function initializing a production-grade SkyraLogger instance.
    """
    resolved_config = resolve_config(
        project_id=project_id,
        service_name=service_name,
        environment=environment,
        instance_id=instance_id,
        level=level,
        service_version=service_version,
        node_name=node_name,
        transport=transport,
        fsync_on_levels=fsync_on_levels,
        additional_sensitive_keys=additional_sensitive_keys,
        limits=limits,
        clock=clock,
        on_error=on_error,
        on_drop=on_drop,
    )
    return SkyraLogger(config=resolved_config)
