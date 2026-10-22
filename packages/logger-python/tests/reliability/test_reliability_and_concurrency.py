"""
Reliability, concurrency, queue backpressure, and fault tolerance tests for Skyra Python Logger.
Tests 25-36 of Section 22:
25. Multithreaded logging
26. Queue saturation
27. Critical priority eviction
28. All-critical saturation
29. Background writer failure
30. Disk-full simulation
31. Repeated flush
32. Repeated close
33. Concurrent log and flush
34. Shutdown with pending events
35. Process-ownership collision
36. Stale lock handling
"""

import os
import tempfile
import threading
import time
import unittest
from pathlib import Path
from typing import List
import sys

# Ensure packages/logger-python is in sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from skyra_logger import (

    create_skyra_logger,
    parse_strict_json,
    validate_log_event,
)
from skyra_logger.config import ResourceLimits
from skyra_logger.internal.ownership import (
    InstanceOwnershipConflictError,
    InstanceOwnershipManager,
)
from skyra_logger.internal.write_queue import WriteQueue


class TestReliabilityAndConcurrency(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.log_dir = Path(self.temp_dir.name)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_25_multithreaded_logging(self):
        """25. Multithreaded logging: Concurrent threads emit events without line corruption."""
        logger = create_skyra_logger(
            project_id="skyra-thread",
            service_name="thread-service",
            transport={"type": "file", "directory": str(self.log_dir)},
        )

        num_threads = 8
        events_per_thread = 50
        errors: List[Exception] = []

        def worker(thread_idx: int):
            try:
                for i in range(events_per_thread):
                    logger.info(
                        f"Thread {thread_idx} event {i}",
                        {"thread_id": thread_idx, "seq": i},
                    )
            except Exception as e:
                errors.append(e)

        threads = [threading.Thread(target=worker, args=(t,)) for t in range(num_threads)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        self.assertEqual(len(errors), 0)
        logger.flush()

        status = logger.get_status()
        self.assertEqual(status["total_events_written"], num_threads * events_per_thread)

        active_file = status["active_file"]
        with open(active_file, "r", encoding="utf-8") as f:
            lines = [l.strip() for l in f if l.strip()]

        self.assertEqual(len(lines), num_threads * events_per_thread)
        for line in lines:
            event = parse_strict_json(line)
            valid, errs = validate_log_event(event)
            self.assertTrue(valid, f"Corrupted event in multithreaded log: {errs}")

        logger.close()

    def test_26_queue_saturation(self):
        """26. Queue saturation: Non-critical events are dropped under backpressure."""
        dropped_events: List[int] = []

        # Create logger with tiny queue limit (10 items) and artificial slow transport
        limits = ResourceLimits(max_pending_events=10, max_queue_memory_bytes=4096)
        written_items: List[str] = []

        def slow_writer(batch):
            time.sleep(0.05)
            for item in batch:
                written_items.append(item.line)

        def on_drop(count, reason):
            dropped_events.append(count)

        queue = WriteQueue(limits=limits, write_handler=slow_writer, on_drop=on_drop)

        # Enqueue 50 info events rapidly
        for i in range(50):
            queue.enqueue("info", f'{{"@timestamp":"2026-10-22T00:00:00.000Z","msg":"item {i}"}}\n')

        queue.flush(timeout=5.0)
        queue.close()

        self.assertGreater(queue.dropped_count, 0)
        self.assertGreater(len(dropped_events), 0)
        self.assertLessEqual(len(written_items), 50)

    def test_27_critical_priority_eviction(self):
        """27. Critical priority eviction: error and fatal events evict queued info events."""
        limits = ResourceLimits(max_pending_events=5, max_queue_memory_bytes=2048)
        processed: List[str] = []
        evictions: List[int] = []

        def slow_writer(batch):
            time.sleep(0.05)
            for item in batch:
                processed.append(item.level)

        def on_drop(count, reason):
            evictions.append(count)

        queue = WriteQueue(limits=limits, write_handler=slow_writer, on_drop=on_drop)

        # Fill queue with 5 info events
        for i in range(5):
            queue.enqueue("info", f'{{"i":{i}}}\n')

        # Now submit an error event: should evict an info event to guarantee admission
        accepted = queue.enqueue("error", '{"error":"critical_failure"}\n')
        self.assertTrue(accepted, "Critical error event must be accepted via priority eviction")

        queue.flush(timeout=5.0)
        queue.close()

        self.assertIn("error", processed)
        self.assertGreater(len(evictions), 0)

    def test_28_all_critical_saturation(self):
        """28. All-critical saturation: When queue is full of critical events, memory bounds are preserved."""
        limits = ResourceLimits(max_pending_events=5, max_queue_memory_bytes=2048)

        def slow_writer(batch):
            time.sleep(0.05)

        queue = WriteQueue(limits=limits, write_handler=slow_writer)

        # Fill queue with 5 critical events
        for i in range(5):
            queue.enqueue("error", f'{{"error":{i}}}\n')

        # 6th critical event cannot evict existing critical events: safe drop with metric
        accepted = queue.enqueue("fatal", '{"fatal":"cannot_evict_other_critical"}\n')
        self.assertFalse(accepted, "Cannot evict critical events for another critical event when at capacity")
        self.assertEqual(queue.dropped_count, 1)

        queue.flush(timeout=5.0)
        queue.close()

    def test_29_background_writer_failure(self):
        """29. Background writer failure: Caught safely, triggers on_error without crashing."""
        handled_errors: List[Exception] = []

        def err_callback(err):
            handled_errors.append(err)

        logger = create_skyra_logger(
            project_id="skyra-fail",
            service_name="fail-service",
            transport={"type": "stdout"},
            on_error=err_callback,
        )

        # Patch physical transport write to raise an error
        def failing_write(lvl, line, bytes_cnt):
            raise IOError("Simulated disk error")

        logger.transport.write = failing_write  # type: ignore

        logger.info("This event will fail during physical write")
        logger.flush()
        logger.close()

        self.assertGreaterEqual(len(handled_errors), 1)
        self.assertIsInstance(handled_errors[0], IOError)

    def test_30_disk_full_simulation(self):
        """30. Disk full simulation: OSError caught and handled."""
        handled_errors: List[Exception] = []

        logger = create_skyra_logger(
            project_id="skyra-diskfull",
            service_name="disk-service",
            transport={"type": "stdout"},
            on_error=lambda e: handled_errors.append(e),
        )

        def enospc_write(lvl, line, bytes_cnt):
            err = OSError(28, "No space left on device")
            raise err

        logger.transport.write = enospc_write  # type: ignore
        logger.error("Disk is full alert")
        logger.flush()
        logger.close()

        self.assertGreaterEqual(len(handled_errors), 1)

    def test_31_repeated_flush(self):
        """31. Calling flush() repeatedly is safe and idempotent."""
        logger = create_skyra_logger(
            project_id="skyra-flush",
            service_name="flush-service",
            transport={"type": "file", "directory": str(self.log_dir)},
        )
        logger.info("Event 1")
        logger.flush()
        logger.flush()
        logger.flush()
        self.assertEqual(logger.get_status()["total_events_written"], 1)
        logger.close()

    def test_32_repeated_close(self):
        """32. Calling close() repeatedly is safe and idempotent."""
        logger = create_skyra_logger(
            project_id="skyra-close",
            service_name="close-service",
            transport={"type": "file", "directory": str(self.log_dir)},
        )
        logger.info("Event before close")
        logger.close()
        logger.close()
        logger.close()
        self.assertTrue(logger.get_status()["is_closed"])

    def test_33_concurrent_log_and_flush(self):
        """33. Concurrent logging while flush() is running does not deadlock or crash."""
        logger = create_skyra_logger(
            project_id="skyra-deadlock",
            service_name="deadlock-service",
            transport={"type": "file", "directory": str(self.log_dir)},
        )

        stop_event = threading.Event()

        def logger_loop():
            i = 0
            while not stop_event.is_set():
                logger.info(f"Rapid event {i}")
                i += 1
                time.sleep(0.001)

        t = threading.Thread(target=logger_loop)
        t.start()

        # Run several flushes in parallel
        for _ in range(5):
            logger.flush()
            time.sleep(0.01)

        stop_event.set()
        t.join()

        logger.flush()
        logger.close()
        self.assertTrue(logger.get_status()["is_closed"])

    def test_34_shutdown_with_pending_events(self):
        """34. Clean drain of pending events upon close()."""
        logger = create_skyra_logger(
            project_id="skyra-drain",
            service_name="drain-service",
            transport={"type": "file", "directory": str(self.log_dir)},
        )

        for i in range(20):
            logger.info(f"Pending event {i}")

        # Close immediately without manual flush
        logger.close()

        status = logger.get_status()
        self.assertEqual(status["total_events_written"], 20)
        self.assertEqual(status["pending_queue_count"], 0)

    def test_35_process_ownership_collision(self):
        """35. Process ownership collision: another active PID cannot acquire directory."""
        inst_dir = self.log_dir / "collision-test"
        inst_dir.mkdir(parents=True, exist_ok=True)

        mgr1 = InstanceOwnershipManager(inst_dir)
        mgr1.acquire()
        self.assertTrue(mgr1.is_owned)

        # In-process second attempt
        mgr2 = InstanceOwnershipManager(inst_dir)
        with self.assertRaises(InstanceOwnershipConflictError):
            mgr2.acquire()

        mgr1.release()

    def test_36_stale_lock_handling(self):
        """36. Stale lock handling: dead PID marker is automatically cleared."""
        inst_dir = self.log_dir / "stale-test"
        inst_dir.mkdir(parents=True, exist_ok=True)
        lock_file = inst_dir / ".instance.owner"

        # Write a stale lock file with an impossible/dead PID (e.g. PID 99999999)
        dead_pid = 99999999
        with open(lock_file, "w", encoding="utf-8") as f:
            f.write(f"pid={dead_pid}\nhostname=ghost-host\ntime=2026-01-01T00:00:00Z\nlock_id=ghost-lock\n")

        # Manager acquires: should detect PID is dead, remove stale lock, and acquire cleanly
        mgr = InstanceOwnershipManager(inst_dir)
        mgr.acquire()
        self.assertTrue(mgr.is_owned)

        # Confirm new lock contains our current PID
        with open(lock_file, "r", encoding="utf-8") as f:
            content = f.read()
        self.assertIn(f"pid={os.getpid()}", content)

        mgr.release()


if __name__ == "__main__":
    unittest.main()
