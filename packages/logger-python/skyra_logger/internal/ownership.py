"""
Single-writer process ownership manager for log instance directories.
Guarantees compliance with ADR-011 and contracts/storage-contract.md.
Ensures exactly one logical writer process per instance directory.
"""

import os
import platform
import socket
import sys
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Set

from .diagnostics import emit_internal_diagnostic


class InstanceOwnershipConflictError(RuntimeError):
    """Raised when another active process already owns the target instance directory."""

    def __init__(self, instance_dir: str, existing_pid: int, details: Optional[str] = None):
        msg = (
            f"Instance ownership conflict: Active process (PID {existing_pid}) holds exclusive "
            f"ownership of directory '{instance_dir}'. Concurrent processes must not write to "
            f"the same instance directory (ADR-011 / storage-contract.md)."
        )
        if details:
            msg += f" {details}"
        super().__init__(msg)
        self.instance_dir = instance_dir
        self.existing_pid = existing_pid


@dataclass
class LockMetadata:
    pid: int
    hostname: str
    timestamp: str
    lock_id: str


def is_process_alive(pid: int) -> bool:
    """
    Checks whether a process with the given PID is actively running.
    Works reliably on POSIX and Windows.
    """
    if pid <= 0:
        return False
    if pid == os.getpid():
        return True

    # On POSIX and modern Windows Python (3.8+), os.kill(pid, 0) checks process existence
    try:
        os.kill(pid, 0)
        return True
    except PermissionError:
        # EPERM: Process exists and is alive, but we lack permissions to signal it
        return True
    except ProcessLookupError:
        # ESRCH: Process does not exist
        return False
    except OSError as err:
        # On Windows, ESRCH / ERROR_INVALID_PARAMETER (87) means dead
        # ERROR_ACCESS_DENIED (5) means alive
        if hasattr(err, "winerror"):
            if err.winerror == 5:
                return True
            if err.winerror == 87:
                return False
        return False


def parse_lock_content(content: str) -> Optional[LockMetadata]:
    """
    Parses lock metadata from .instance.owner content.
    """
    try:
        lines = content.splitlines()
        pid: Optional[int] = None
        hostname = ""
        timestamp = ""
        lock_id = ""

        for line in lines:
            trimmed = line.strip()
            if trimmed.startswith("pid="):
                pid = int(trimmed[4:])
            elif trimmed.startswith("hostname="):
                hostname = trimmed[9:]
            elif trimmed.startswith("time="):
                timestamp = trimmed[5:]
            elif trimmed.startswith("lock_id=") or trimmed.startswith("lockId="):
                lock_id = trimmed.split("=", 1)[1]

        if pid is not None:
            return LockMetadata(pid=pid, hostname=hostname, timestamp=timestamp, lock_id=lock_id)
        return None
    except Exception:
        return None


class InstanceOwnershipManager:
    """
    Manages atomic single-writer instance ownership using exclusive marker file creation.
    """

    _global_lock = threading.Lock()
    _active_owned_directories: Set[str] = set()

    def __init__(self, instance_dir: Path, file_mode: int = 0o640):
        self.canonical_dir = str(instance_dir.resolve())
        self.lock_path = instance_dir / ".instance.owner"
        self.file_mode = file_mode
        self._is_owned = False
        self.lock_id = f"{os.getpid()}-{int(time.time() * 1000)}-{os.urandom(4).hex()}"

    def acquire(self) -> None:
        """
        Atomically acquires exclusive ownership of the instance directory.
        Raises InstanceOwnershipConflictError if another active process or thread owns it.
        """
        with InstanceOwnershipManager._global_lock:
            if self.canonical_dir in InstanceOwnershipManager._active_owned_directories:
                raise InstanceOwnershipConflictError(
                    self.canonical_dir,
                    os.getpid(),
                    "Concurrent logger instance already active in this process for directory.",
                )

        lock_payload = (
            f"pid={os.getpid()}\n"
            f"hostname={socket.gethostname()}\n"
            f"time={datetime.now(timezone.utc).isoformat()}\n"
            f"lock_id={self.lock_id}\n"
        ).encode("utf-8")

        max_retries = 3
        for attempt in range(max_retries):
            try:
                # Atomic exclusive creation: fails with FileExistsError if file exists
                flags = os.O_CREAT | os.O_EXCL | os.O_WRONLY
                if hasattr(os, "O_BINARY"):
                    flags |= os.O_BINARY

                fd = os.open(str(self.lock_path), flags, self.file_mode)
                try:
                    os.write(fd, lock_payload)
                    if hasattr(os, "fsync"):
                        os.fsync(fd)
                finally:
                    os.close(fd)

                self._is_owned = True
                with InstanceOwnershipManager._global_lock:
                    InstanceOwnershipManager._active_owned_directories.add(self.canonical_dir)
                return

            except FileExistsError:
                # Marker file exists. Inspect existing lock
                existing_lock: Optional[LockMetadata] = None
                try:
                    with open(self.lock_path, "r", encoding="utf-8") as f:
                        existing_lock = parse_lock_content(f.read())
                except Exception:
                    # File may have been unlinked concurrently
                    time.sleep(0.01)
                    continue

                if existing_lock:
                    if existing_lock.pid == os.getpid():
                        # Leftover from a prior logger in this same process that was closed
                        try:
                            self.lock_path.unlink(missing_ok=True)
                            continue
                        except Exception:
                            pass

                    if is_process_alive(existing_lock.pid):
                        # Another active process holds exclusive ownership
                        raise InstanceOwnershipConflictError(
                            self.canonical_dir, existing_lock.pid
                        )

                    # Process is dead -> Stale lock detected. Safely clean up and retry
                    emit_internal_diagnostic(
                        "StaleLockDetected",
                        f"Removing stale ownership lock from dead PID {existing_lock.pid} in '{self.canonical_dir}'",
                    )
                    try:
                        self.lock_path.unlink(missing_ok=True)
                    except Exception:
                        pass
                else:
                    # Corrupt or empty lock file
                    try:
                        self.lock_path.unlink(missing_ok=True)
                    except Exception:
                        pass

                time.sleep(0.01)

        # If exhausted retries while another process holds or races for the lock
        final_lock: Optional[LockMetadata] = None
        try:
            with open(self.lock_path, "r", encoding="utf-8") as f:
                final_lock = parse_lock_content(f.read())
        except Exception:
            pass
        raise InstanceOwnershipConflictError(
            self.canonical_dir,
            final_lock.pid if final_lock else -1,
            "Failed to acquire exclusive lock after multiple attempts."
        )

    def release(self) -> None:
        """
        Releases the ownership lock file if owned by this process.
        """
        if not self._is_owned:
            return
        try:
            if self.lock_path.exists():
                with open(self.lock_path, "r", encoding="utf-8") as f:
                    content = f.read()
                existing = parse_lock_content(content)
                if existing and existing.pid == os.getpid():
                    self.lock_path.unlink(missing_ok=True)
        except Exception:
            pass
        finally:
            self._is_owned = False
            with InstanceOwnershipManager._global_lock:
                InstanceOwnershipManager._active_owned_directories.discard(self.canonical_dir)

    @property
    def is_owned(self) -> bool:
        return self._is_owned
