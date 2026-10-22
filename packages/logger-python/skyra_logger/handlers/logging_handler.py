"""
Standard Python logging module integration handler.
Adapts native logging.LogRecord instances into canonical Skyra Log Events.
"""

import logging
import traceback
from typing import Any, Dict, Optional

from ..types import LogLevel

STANDARD_LOGRECORD_ATTRS = {
    "name",
    "msg",
    "args",
    "levelname",
    "levelno",
    "pathname",
    "filename",
    "module",
    "exc_info",
    "exc_text",
    "stack_info",
    "lineno",
    "funcName",
    "created",
    "msecs",
    "relativeCreated",
    "thread",
    "threadName",
    "processName",
    "process",
    "message",
    "asctime",
    "taskName",
}


def map_logging_level(levelno: int) -> LogLevel:
    """
    Maps standard Python logging level numbers to canonical Skyra log levels.
    """
    if levelno >= logging.CRITICAL:
        return "fatal"
    if levelno >= logging.ERROR:
        return "error"
    if levelno >= logging.WARNING:
        return "warn"
    if levelno >= logging.INFO:
        return "info"
    if levelno > 5:
        return "debug"
    return "trace"


class SkyraLoggingHandler(logging.Handler):
    """
    Custom logging.Handler that forwards standard library log records to an
    underlying SkyraLogger instance without recursive loops or duplicate emissions.
    """

    def __init__(self, skyra_logger: Any, level: int = logging.NOTSET):
        super().__init__(level=level)
        self.skyra_logger = skyra_logger
        self._in_emit = False

    def emit(self, record: logging.LogRecord) -> None:
        """
        Translates a logging.LogRecord into a Skyra log invocation.
        Guarded against re-entrant recursive loops.
        """
        if self._in_emit:
            return

        self._in_emit = True
        try:
            canonical_level = map_logging_level(record.levelno)

            # Format primary message
            try:
                msg = record.getMessage()
            except Exception:
                msg = str(record.msg)

            # Build metadata
            metadata: Dict[str, Any] = {
                "logger": record.name,
            }

            # Extract exception info if present
            if record.exc_info and record.exc_info[1] is not None:
                exc_type, exc_val, exc_tb = record.exc_info
                metadata["error"] = {
                    "type": exc_type.__name__ if exc_type else "Error",
                    "message": str(exc_val),
                    "stack_trace": "".join(traceback.format_exception(exc_type, exc_val, exc_tb)),
                }

            # Extract user-provided 'extra' fields
            for attr, val in record.__dict__.items():
                if attr not in STANDARD_LOGRECORD_ATTRS and not attr.startswith("_"):
                    metadata[attr] = val

            # Forward to SkyraLogger
            self.skyra_logger.log(canonical_level, msg, metadata=metadata)

        except Exception as err:
            self.handleError(record)
        finally:
            self._in_emit = False

    def flush(self) -> None:
        """Flushes the underlying Skyra logger."""
        try:
            if hasattr(self.skyra_logger, "flush"):
                self.skyra_logger.flush()
        except Exception:
            pass

    def close(self) -> None:
        """Closes the handler without automatically destroying the shared logger."""
        try:
            self.flush()
        finally:
            super().close()
