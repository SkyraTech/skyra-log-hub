"""
Stdout transport for containerized and serverless environments.
Emits canonical JSONL directly to sys.stdout.
"""

import sys
import threading
from typing import Any, Dict

from ..types import LogLevel


class StdoutTransport:
    """
    Standard output transport for Docker, Kubernetes, and serverless runtimes.
    """

    def __init__(self):
        self._lock = threading.Lock()
        self.total_events_written = 0
        self.total_bytes_written = 0
        self.is_closed = False

    def write(self, level: LogLevel, line: str, byte_count: int) -> None:
        with self._lock:
            if self.is_closed:
                return
            try:
                sys.stdout.write(line)
                self.total_events_written += 1
                self.total_bytes_written += byte_count
            except (BrokenPipeError, OSError):
                # Avoid crashing application if stdout pipe was broken
                pass

    def flush(self) -> None:
        with self._lock:
            try:
                sys.stdout.flush()
            except Exception:
                pass

    def close(self) -> None:
        with self._lock:
            self.is_closed = True
            try:
                sys.stdout.flush()
            except Exception:
                pass

    def get_status(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "total_events_written": self.total_events_written,
                "total_bytes_written": self.total_bytes_written,
                "total_events_fsynced": 0,
                "is_closed": self.is_closed,
            }
