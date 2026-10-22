"""
Production-grade JSONL file transport with single-writer ownership,
UTC midnight daily rotation, size-based rollover, crash recovery, and durability guarantees.
Adheres strictly to ADR-011 and contracts/storage-contract.md.
"""

import os
import threading
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Dict, Optional, Set

from ..config import FileTransportConfig, ResolvedSkyraLoggerConfig
from ..internal.diagnostics import emit_internal_diagnostic
from ..internal.ownership import InstanceOwnershipManager
from ..internal.path_safety import resolve_safe_log_directory
from ..internal.recovery import recover_partial_line
from ..internal.rotation import (
    build_part_filename,
    format_utc_date,
    resolve_active_file_state,
)
from ..types import LogLevel


class JsonlFileTransport:
    """
    Physical JSONL file transport managing daily and size-based rotation,
    exclusive process directory ownership, partial-line recovery, and atomic append.
    """

    def __init__(self, config: ResolvedSkyraLoggerConfig, file_config: FileTransportConfig):
        self.config = config
        self.file_config = file_config
        self.max_file_size_bytes = file_config.rotation.max_file_size_bytes
        self.fsync_levels: Set[str] = set(config.fsync_on_levels)
        self.clock: Callable[[], datetime] = config.clock
        self.dir_mode = file_config.permissions.dir_mode
        self.file_mode = file_config.permissions.file_mode

        # Resolve deterministic instance directory
        self.instance_dir: Path = resolve_safe_log_directory(
            file_config.directory,
            config.project_id,
            config.environment,
            config.service_name,
            config.instance_id,
        )

        self._lock = threading.Lock()
        self.ownership_manager = InstanceOwnershipManager(self.instance_dir, self.file_mode)

        self.current_fd: Optional[int] = None
        self.current_date_str = ""
        self.current_part_index = 0
        self.current_size_bytes = 0
        self.current_filename = ""
        self.is_closed = False

        self.total_events_written = 0
        self.total_bytes_written = 0
        self.total_events_fsynced = 0

        self._init_instance_directory()
        self._open_current_segment()

    def _init_instance_directory(self) -> None:
        """
        Creates the target instance directory hierarchy and acquires exclusive process ownership.
        """
        try:
            self.instance_dir.mkdir(parents=True, exist_ok=True, mode=self.dir_mode)
            self.ownership_manager.acquire()
        except Exception as err:
            emit_internal_diagnostic(
                "DirectoryInitError",
                f"Failed to initialize log directory '{self.instance_dir}'",
                err if isinstance(err, Exception) else None,
            )
            raise

    def _open_current_segment(self) -> None:
        """
        Initializes or opens the active file segment for the current UTC date.
        Performs partial-line recovery if an existing file contains incomplete fragments.
        """
        today_str = format_utc_date(self.clock())
        state = resolve_active_file_state(self.instance_dir, today_str)

        self.current_date_str = today_str
        self.current_part_index = state.part_index
        self.current_filename = state.filename
        target_path = state.full_path

        # Check existing segment for partial-line corruption or incomplete records
        if target_path.exists():
            recovery = recover_partial_line(target_path, self.instance_dir, today_str)
            self.current_size_bytes = recovery.final_size_bytes

            # If recovered existing segment already exceeds max_file_size_bytes, rollover immediately
            if self.current_size_bytes >= self.max_file_size_bytes:
                self.current_part_index += 1
                self.current_filename = build_part_filename(self.current_date_str, self.current_part_index)
                self.current_size_bytes = 0
        else:
            self.current_size_bytes = 0

        active_path = self.instance_dir / self.current_filename
        flags = os.O_CREAT | os.O_APPEND | os.O_WRONLY
        if hasattr(os, "O_BINARY"):
            flags |= os.O_BINARY

        self.current_fd = os.open(str(active_path), flags, self.file_mode)

    def write(self, level: LogLevel, line: str, byte_count: int) -> None:
        """
        Appends a formatted JSONL line to the active log segment with rollover checks and fsync.
        """
        with self._lock:
            if self.is_closed or self.current_fd is None:
                return

            now = self.clock()
            today_str = format_utc_date(now)

            # Check 1: UTC Midnight Rollover
            if today_str != self.current_date_str:
                self._rollover_for_new_day(today_str)

            # Check 2: Size-Based Rollover
            elif self.current_size_bytes + byte_count > self.max_file_size_bytes:
                self._rollover_for_size()

            # Physical atomic write
            data = line.encode("utf-8")
            os.write(self.current_fd, data)
            self.current_size_bytes += len(data)
            self.total_events_written += 1
            self.total_bytes_written += len(data)

            # Check 3: Synchronous fsync durability on configured levels
            if level in self.fsync_levels:
                try:
                    if hasattr(os, "fsync"):
                        os.fsync(self.current_fd)
                    self.total_events_fsynced += 1
                except Exception as err:
                    emit_internal_diagnostic("FsyncError", f"Failed fsync on '{self.current_filename}'", err)

    def _rollover_for_new_day(self, new_date_str: str) -> None:
        """Finalizes the active segment and starts part 0000 on the new UTC date."""
        self._close_current_fd()
        self.current_date_str = new_date_str
        self.current_part_index = 0
        self.current_filename = build_part_filename(new_date_str, 0)
        self.current_size_bytes = 0

        active_path = self.instance_dir / self.current_filename
        flags = os.O_CREAT | os.O_APPEND | os.O_WRONLY
        if hasattr(os, "O_BINARY"):
            flags |= os.O_BINARY
        self.current_fd = os.open(str(active_path), flags, self.file_mode)

    def _rollover_for_size(self) -> None:
        """Finalizes the active segment and increments part index for the current date."""
        self._close_current_fd()
        self.current_part_index += 1
        self.current_filename = build_part_filename(self.current_date_str, self.current_part_index)
        self.current_size_bytes = 0

        active_path = self.instance_dir / self.current_filename
        flags = os.O_CREAT | os.O_APPEND | os.O_WRONLY
        if hasattr(os, "O_BINARY"):
            flags |= os.O_BINARY
        self.current_fd = os.open(str(active_path), flags, self.file_mode)

    def _close_current_fd(self) -> None:
        if self.current_fd is not None:
            try:
                if hasattr(os, "fsync"):
                    os.fsync(self.current_fd)
            except Exception:
                pass
            try:
                os.close(self.current_fd)
            except Exception:
                pass
            self.current_fd = None

    def flush(self) -> None:
        """Flushes user-space buffers and fsyncs active file descriptor."""
        with self._lock:
            if self.current_fd is not None:
                try:
                    if hasattr(os, "fsync"):
                        os.fsync(self.current_fd)
                except Exception:
                    pass

    def close(self) -> None:
        """Finalizes the active file descriptor and releases process ownership lock."""
        with self._lock:
            if self.is_closed:
                return
            self.is_closed = True
            self._close_current_fd()
            self.ownership_manager.release()

    def get_status(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "active_file": str(self.instance_dir / self.current_filename) if self.current_filename else None,
                "current_size_bytes": self.current_size_bytes,
                "total_events_written": self.total_events_written,
                "total_bytes_written": self.total_bytes_written,
                "total_events_fsynced": self.total_events_fsynced,
                "is_closed": self.is_closed,
            }
