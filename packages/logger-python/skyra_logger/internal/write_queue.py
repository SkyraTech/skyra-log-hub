"""
Bounded background write queue with priority eviction and dedicated worker thread.
Preserves single-writer serialization, bounded memory, and clean shutdown drain.
"""

import collections
import threading
import time
from dataclasses import dataclass
from typing import Callable, Deque, List, Optional

from ..config import ResourceLimits, DEFAULT_RESOURCE_LIMITS
from ..types import LogLevel
from .diagnostics import emit_internal_diagnostic


@dataclass
class QueueItem:
    level: LogLevel
    line: str
    byte_count: int


WriteBatchHandler = Callable[[List[QueueItem]], None]
DropHandler = Callable[[int, str], None]


class WriteQueue:
    """
    Thread-safe bounded queue with a dedicated background writer thread.
    Preserves FIFO order, respects memory bounds, and implements priority eviction
    for critical log events under backpressure.
    """

    def __init__(
        self,
        limits: Optional[ResourceLimits],
        write_handler: WriteBatchHandler,
        on_drop: Optional[DropHandler] = None,
    ):
        self.limits = limits or DEFAULT_RESOURCE_LIMITS
        self.write_handler = write_handler
        self.on_drop = on_drop

        self._queue: Deque[QueueItem] = collections.deque()
        self._current_bytes = 0
        self._is_closed = False
        self._lock = threading.RLock()
        self._not_empty = threading.Condition(self._lock)
        self._drain_cond = threading.Condition(self._lock)

        self._accepted_count = 0
        self._dropped_count = 0
        self._is_writing = False

        # Start dedicated background worker thread
        self._worker_thread = threading.Thread(
            target=self._worker_loop,
            name="SkyraLoggerWriterThread",
            daemon=True,
        )
        self._worker_thread.start()

    def enqueue(self, level: LogLevel, line: str) -> bool:
        """
        Enqueues a formatted log record for background writing.
        Thread-safe. Implements priority eviction for critical events (error, fatal).
        Returns True if accepted, False if dropped.
        """
        item_bytes = len(line.encode("utf-8"))
        is_critical = level in ("error", "fatal")

        with self._lock:
            if self._is_closed:
                emit_internal_diagnostic("WriteQueue", "Write attempted after logger has been closed")
                self._dropped_count += 1
                return False

            would_exceed_count = len(self._queue) + 1 > self.limits.max_pending_events
            would_exceed_memory = self._current_bytes + item_bytes > self.limits.max_queue_memory_bytes

            if would_exceed_count or would_exceed_memory:
                if is_critical:
                    # Priority Eviction: Evict oldest non-critical events
                    evicted_bytes = 0
                    evicted_count = 0
                    temp_deque: Deque[QueueItem] = collections.deque()

                    while self._queue:
                        item = self._queue.popleft()
                        if item.level not in ("error", "fatal"):
                            self._current_bytes -= item.byte_count
                            evicted_bytes += item.byte_count
                            evicted_count += 1

                            still_exceeds_count = len(self._queue) + len(temp_deque) + 1 > self.limits.max_pending_events
                            still_exceeds_memory = self._current_bytes + item_bytes > self.limits.max_queue_memory_bytes
                            if not still_exceeds_count and not still_exceeds_memory:
                                break
                        else:
                            temp_deque.append(item)

                    # Reconstruct queue with remaining items
                    temp_deque.extend(self._queue)
                    self._queue = temp_deque

                    if evicted_count > 0:
                        self._dropped_count += evicted_count
                        emit_internal_diagnostic(
                            "QueueEviction",
                            f"Evicted {evicted_count} non-critical events ({evicted_bytes} bytes) "
                            f"to accommodate critical event level='{level}'",
                        )
                        if self.on_drop:
                            try:
                                self.on_drop(evicted_count, f"Evicted by critical event level='{level}'")
                            except Exception:
                                pass

                    # Re-check capacity after eviction
                    would_exceed_count = len(self._queue) + 1 > self.limits.max_pending_events
                    would_exceed_memory = self._current_bytes + item_bytes > self.limits.max_queue_memory_bytes

                    if would_exceed_count or would_exceed_memory:
                        # Queue is completely full of critical events
                        self._dropped_count += 1
                        reason = (
                            f"Critical queue memory saturated ({self._current_bytes} + {item_bytes} > "
                            f"{self.limits.max_queue_memory_bytes} bytes)"
                            if would_exceed_memory
                            else f"Critical queue item limit saturated ({len(self._queue)} >= {self.limits.max_pending_events})"
                        )
                        emit_internal_diagnostic("CriticalQueueSaturation", f"Dropped critical log level='{level}': {reason}")
                        if self.on_drop:
                            try:
                                self.on_drop(1, reason)
                            except Exception:
                                pass
                        return False
                else:
                    # Non-critical event dropped under backpressure
                    self._dropped_count += 1
                    reason = (
                        f"Queue memory saturated ({self._current_bytes} + {item_bytes} > {self.limits.max_queue_memory_bytes} bytes)"
                        if would_exceed_memory
                        else f"Queue item limit saturated ({len(self._queue)} >= {self.limits.max_pending_events})"
                    )
                    emit_internal_diagnostic("QueueDrop", f"Dropped non-critical log level='{level}': {reason}")
                    if self.on_drop:
                        try:
                            self.on_drop(1, reason)
                        except Exception:
                            pass
                    return False

            # Append item to queue
            self._queue.append(QueueItem(level=level, line=line, byte_count=item_bytes))
            self._current_bytes += item_bytes
            self._accepted_count += 1
            self._not_empty.notify()
            return True

    def flush(self, timeout: float = 30.0) -> bool:
        """
        Blocks until all currently queued events are fully processed by the background writer.
        Returns True if queue was drained within timeout, False otherwise.
        """
        deadline = time.monotonic() + timeout
        with self._drain_cond:
            while len(self._queue) > 0 or self._is_writing:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    return False
                self._drain_cond.wait(timeout=remaining)
            return True

    def close(self, timeout: float = 30.0) -> None:
        """
        Closes queue to new submissions, flushes pending records, and terminates worker thread.
        """
        with self._lock:
            self._is_closed = True
            self._not_empty.notify_all()

        # Wait for worker thread to finish draining
        if self._worker_thread.is_alive():
            self._worker_thread.join(timeout=timeout)

    def _worker_loop(self) -> None:
        """
        Dedicated background worker routine that pulls batches from queue and passes them
        to the physical writer handler.
        """
        while True:
            batch: List[QueueItem] = []
            with self._lock:
                while not self._queue and not self._is_closed:
                    self._not_empty.wait()

                if not self._queue and self._is_closed:
                    self._drain_cond.notify_all()
                    break

                # Drain up to 256 items per batch
                batch_limit = 256
                while self._queue and len(batch) < batch_limit:
                    item = self._queue.popleft()
                    self._current_bytes -= item.byte_count
                    batch.append(item)

                self._is_writing = True

            # Write batch outside lock to avoid blocking enqueue
            try:
                if batch:
                    self.write_handler(batch)
            except Exception as err:
                emit_internal_diagnostic("WriteHandlerError", f"Physical writer batch failed: {err}", err)
            finally:
                with self._lock:
                    self._is_writing = False
                    if len(self._queue) == 0:
                        self._drain_cond.notify_all()

    @property
    def pending_count(self) -> int:
        with self._lock:
            return len(self._queue)

    @property
    def pending_bytes(self) -> int:
        with self._lock:
            return self._current_bytes

    @property
    def accepted_count(self) -> int:
        with self._lock:
            return self._accepted_count

    @property
    def dropped_count(self) -> int:
        with self._lock:
            return self._dropped_count

    @property
    def is_closed(self) -> bool:
        with self._lock:
            return self._is_closed
