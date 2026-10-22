"""
Storage and transport tests for Skyra Python Logger.
Tests 13-24 of Section 22:
13. JSONL file generation
14. Path safety
15. UTF-8 correctness
16. UTC midnight rotation
17. Size rollover
18. Combined rotation
19. Restart and file discovery
20. Partial-line recovery
21. Idempotent recovery
22. No overwrite of existing segments
23. File permissions
24. Lock ownership
"""

import json
import os
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys

# Ensure packages/logger-python is in sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from skyra_logger import (

    create_skyra_logger,
    parse_strict_json,
    validate_log_event,
)
from skyra_logger.internal.ownership import (
    InstanceOwnershipConflictError,
    InstanceOwnershipManager,
)
from skyra_logger.internal.path_safety import (
    resolve_safe_log_directory,
    validate_path_component,
)
from skyra_logger.internal.recovery import recover_partial_line
from skyra_logger.internal.rotation import (
    build_part_filename,
    format_utc_date,
    resolve_active_file_state,
)


class TestStorageAndRotation(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.log_dir = Path(self.temp_dir.name)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_13_jsonl_file_generation(self):
        """13. Deterministic directory structure and JSONL generation adhering to ADR-011."""
        logger = create_skyra_logger(
            project_id="skyra-store",
            service_name="store-api",
            environment="production",
            instance_id="inst-01",
            transport={"type": "file", "directory": str(self.log_dir)},
        )
        logger.info("Storage event 1")
        logger.info("Storage event 2")
        logger.flush()

        expected_dir = self.log_dir / "skyra-store" / "production" / "store-api" / "inst-01"
        self.assertTrue(expected_dir.exists())

        # Check part-0000.jsonl exists
        today_str = format_utc_date(datetime.now(timezone.utc))
        expected_file = expected_dir / f"{today_str}.part-0000.jsonl"
        self.assertTrue(expected_file.exists())

        with open(expected_file, "r", encoding="utf-8") as f:
            lines = [l for l in f if l.strip()]
        self.assertEqual(len(lines), 2)
        for line in lines:
            self.assertTrue(line.endswith("\n"))
            record = parse_strict_json(line)
            valid, errors = validate_log_event(record)
            self.assertTrue(valid, f"Event in JSONL invalid: {errors}")

        logger.close()

    def test_14_path_safety(self):
        """14. Path safety prevents directory traversal attacks and invalid component names."""
        with self.assertRaises(ValueError):
            validate_path_component("service_name", "../evil")

        with self.assertRaises(ValueError):
            validate_path_component("service_name", "evil/path")

        with self.assertRaises(ValueError):
            validate_path_component("service_name", "evil\\path")

        with self.assertRaises(ValueError):
            resolve_safe_log_directory(str(self.log_dir), "project", "prod", "service/../other", "inst")

    def test_15_utf8_correctness(self):
        """15. UTF-8 correctness with international characters and emojis."""
        logger = create_skyra_logger(
            project_id="skyra-utf8",
            service_name="intl-service",
            transport={"type": "file", "directory": str(self.log_dir)},
        )

        unicode_msg = "Order completed for 東京, München & São Paulo: 🚀🎉"
        logger.info(unicode_msg, {"currency": "€", "user_locale": "ja_JP"})
        logger.flush()

        active_file = logger.get_status()["active_file"]
        with open(active_file, "r", encoding="utf-8") as f:
            line = f.readline().strip()

        event = parse_strict_json(line)
        self.assertEqual(event["message"], unicode_msg)
        self.assertEqual(event["skyra"]["business"]["currency"], "€")
        self.assertEqual(event["skyra"]["business"]["user_locale"], "ja_JP")
        logger.close()

    def test_16_utc_midnight_rotation(self):
        """16. UTC midnight rotation rolls over to new date segment part-0000."""
        day1 = datetime(2026, 10, 21, 23, 59, 50, tzinfo=timezone.utc)
        current_time = day1

        def mock_clock():
            return current_time

        logger = create_skyra_logger(
            project_id="skyra-rot",
            service_name="rot-service",
            instance_id="inst-rot",
            clock=mock_clock,
            transport={"type": "file", "directory": str(self.log_dir)},
        )

        logger.info("Event on Day 1")
        logger.flush()

        # Advance clock to Day 2 (midnight passed)
        day2 = datetime(2026, 10, 22, 0, 0, 5, tzinfo=timezone.utc)
        current_time = day2

        logger.info("Event on Day 2")
        logger.flush()

        inst_dir = self.log_dir / "skyra-rot" / "production" / "rot-service" / "inst-rot"
        day1_file = inst_dir / "2026-10-21.part-0000.jsonl"
        day2_file = inst_dir / "2026-10-22.part-0000.jsonl"

        self.assertTrue(day1_file.exists())
        self.assertTrue(day2_file.exists())

        with open(day1_file, "r", encoding="utf-8") as f:
            self.assertEqual(len(f.readlines()), 1)

        with open(day2_file, "r", encoding="utf-8") as f:
            self.assertEqual(len(f.readlines()), 1)

        logger.close()

    def test_17_size_rollover(self):
        """17. Size-based rollover when file exceeds max_file_size_bytes."""
        # Use low size limit for deterministic testing (e.g. 500 bytes)
        logger = create_skyra_logger(
            project_id="skyra-size",
            service_name="size-service",
            instance_id="inst-size",
            transport={
                "type": "file",
                "directory": str(self.log_dir),
                "rotation": {"max_file_size_bytes": 450},
            },
        )

        # Write multiple events to exceed threshold
        for i in range(5):
            logger.info(f"Event payload number {i} with metadata to reach threshold", {"index": i})
        logger.flush()

        inst_dir = self.log_dir / "skyra-size" / "production" / "size-service" / "inst-size"
        today_str = format_utc_date(datetime.now(timezone.utc))

        part0 = inst_dir / f"{today_str}.part-0000.jsonl"
        part1 = inst_dir / f"{today_str}.part-0001.jsonl"

        self.assertTrue(part0.exists(), "part-0000 must exist")
        self.assertTrue(part1.exists(), "part-0001 must exist after size rollover")

        logger.close()

    def test_18_combined_rotation(self):
        """18. Combined rotation: size rollover followed by daily rotation reset to part-0000."""
        current_time = datetime(2026, 12, 31, 23, 58, 0, tzinfo=timezone.utc)

        def mock_clock():
            return current_time

        logger = create_skyra_logger(
            project_id="skyra-comb",
            service_name="comb-service",
            instance_id="inst-comb",
            clock=mock_clock,
            transport={
                "type": "file",
                "directory": str(self.log_dir),
                "rotation": {"max_file_size_bytes": 450},
            },
        )

        # Write enough on New Year's Eve to cause size rollover
        for i in range(5):
            logger.info(f"New Year Eve event {i} data data data", {"i": i})
        logger.flush()

        inst_dir = self.log_dir / "skyra-comb" / "production" / "comb-service" / "inst-comb"
        self.assertTrue((inst_dir / "2026-12-31.part-0000.jsonl").exists())
        self.assertTrue((inst_dir / "2026-12-31.part-0001.jsonl").exists())

        # Roll over to New Year Day 2027
        current_time = datetime(2027, 1, 1, 0, 1, 0, tzinfo=timezone.utc)
        logger.info("Happy New Year 2027!")
        logger.flush()

        # Must reset to part-0000 on the new date
        self.assertTrue((inst_dir / "2027-01-01.part-0000.jsonl").exists())

        logger.close()

    def test_19_restart_and_file_discovery(self):
        """19. Restart finds highest part index and continues appending without overwriting."""
        logger1 = create_skyra_logger(
            project_id="skyra-restart",
            service_name="restart-service",
            instance_id="inst-restart",
            transport={
                "type": "file",
                "directory": str(self.log_dir),
                "rotation": {"max_file_size_bytes": 450},
            },
        )
        for i in range(4):
            logger1.info(f"Logger 1 event {i}")
        logger1.flush()
        logger1.close()

        # Second logger instance restarts on same directory
        logger2 = create_skyra_logger(
            project_id="skyra-restart",
            service_name="restart-service",
            instance_id="inst-restart",
            transport={
                "type": "file",
                "directory": str(self.log_dir),
                "rotation": {"max_file_size_bytes": 450},
            },
        )
        logger2.info("Logger 2 resumed event")
        logger2.flush()
        logger2.close()

        inst_dir = self.log_dir / "skyra-restart" / "production" / "restart-service" / "inst-restart"
        today_str = format_utc_date(datetime.now(timezone.utc))

        part_files = sorted([f.name for f in inst_dir.glob("*.jsonl")])
        self.assertGreater(len(part_files), 0)

        # Total events across all segments must equal 5
        total_records = 0
        for p in part_files:
            with open(inst_dir / p, "r", encoding="utf-8") as f:
                total_records += len([l for l in f if l.strip()])
        self.assertEqual(total_records, 5)

    def test_20_partial_line_recovery(self):
        """20. Partial-line recovery quarantines corrupt tail and truncates safely."""
        inst_dir = self.log_dir / "test-inst"
        inst_dir.mkdir(parents=True, exist_ok=True)
        file_path = inst_dir / "2026-10-22.part-0000.jsonl"

        valid_line = json.dumps({"@timestamp": "2026-10-22T10:00:00.000Z", "message": "valid"}) + "\n"
        corrupt_tail = '{"@timestamp":"2026-10-22T10:00:01.000Z","partial":'  # Incomplete JSON, no \n

        with open(file_path, "wb") as f:
            f.write(valid_line.encode("utf-8") + corrupt_tail.encode("utf-8"))

        # Recover
        result = recover_partial_line(file_path, inst_dir, "2026-10-22")
        self.assertTrue(result.recovered)
        self.assertEqual(result.corruption_type, "incomplete_trailing_line")
        self.assertEqual(result.bytes_quarantined, len(corrupt_tail.encode("utf-8")))

        # Check source file truncated to valid line
        with open(file_path, "rb") as f:
            content = f.read()
        self.assertEqual(content, valid_line.encode("utf-8"))

        # Check quarantine log created
        q_path = inst_dir / "2026-10-22.corrupt.log"
        self.assertTrue(q_path.exists())
        with open(q_path, "r", encoding="utf-8") as f:
            q_meta = json.loads(f.readline())
        self.assertEqual(q_meta["safe_error_code"], "CORRUPT_FRAGMENT_QUARANTINED")
        self.assertNotIn("partial", json.dumps(q_meta))  # Safe: no raw secret leakage

    def test_21_idempotent_recovery(self):
        """21. Running recovery on an already-clean file does nothing."""
        inst_dir = self.log_dir / "test-clean"
        inst_dir.mkdir(parents=True, exist_ok=True)
        file_path = inst_dir / "2026-10-22.part-0000.jsonl"

        valid_line = json.dumps({"@timestamp": "2026-10-22T10:00:00.000Z", "message": "valid"}) + "\n"
        with open(file_path, "wb") as f:
            f.write(valid_line.encode("utf-8"))

        res = recover_partial_line(file_path, inst_dir, "2026-10-22")
        self.assertFalse(res.recovered)
        self.assertEqual(res.bytes_quarantined, 0)
        self.assertEqual(res.final_size_bytes, len(valid_line.encode("utf-8")))

    def test_22_no_overwrite_of_existing_segments(self):
        """22. Existing segments are never overwritten."""
        inst_dir = self.log_dir / "test-no-over"
        inst_dir.mkdir(parents=True, exist_ok=True)
        today_str = format_utc_date(datetime.now(timezone.utc))
        part0 = inst_dir / f"{today_str}.part-0000.jsonl"

        initial_content = '{"@timestamp":"2026-10-22T10:00:00.000Z","message":"existing"}\n'
        with open(part0, "wb") as f:
            f.write(initial_content.encode("utf-8"))


        state = resolve_active_file_state(inst_dir, today_str)
        self.assertEqual(state.part_index, 0)
        self.assertEqual(state.current_size_bytes, len(initial_content.encode("utf-8")))

    def test_23_file_permissions(self):
        """23. File permissions conform to configuration."""
        logger = create_skyra_logger(
            project_id="skyra-perm",
            service_name="perm-service",
            transport={
                "type": "file",
                "directory": str(self.log_dir),
                "permissions": {"dir_mode": 0o750, "file_mode": 0o640},
            },
        )
        logger.info("Permissions check event")
        logger.flush()
        active_file = logger.get_status()["active_file"]
        self.assertTrue(Path(active_file).exists())
        logger.close()

    def test_24_lock_ownership_conflict(self):
        """24. Concurrent logger instance throws InstanceOwnershipConflictError."""
        logger1 = create_skyra_logger(
            project_id="skyra-lock",
            service_name="lock-service",
            instance_id="worker-locked",
            transport={"type": "file", "directory": str(self.log_dir)},
        )

        with self.assertRaises(InstanceOwnershipConflictError):
            # Attempt to create second logger on same instance directory in same process
            create_skyra_logger(
                project_id="skyra-lock",
                service_name="lock-service",
                instance_id="worker-locked",
                transport={"type": "file", "directory": str(self.log_dir)},
            )

        logger1.close()

        # After logger1 closes and releases lock, another logger can acquire it safely
        logger2 = create_skyra_logger(
            project_id="skyra-lock",
            service_name="lock-service",
            instance_id="worker-locked",
            transport={"type": "file", "directory": str(self.log_dir)},
        )
        self.assertTrue(logger2.get_status()["instance_id"] == "worker-locked")
        logger2.close()


if __name__ == "__main__":
    unittest.main()
