"""
Functional tests for Skyra Python Logger.
Tests 1-12 of Section 22:
1. Logger creation
2. Default configuration
3. Level filtering
4. Canonical event construction
5. UUIDv4 generation
6. UTC timestamps
7. Metadata normalization
8. Child logger behavior
9. Context manager
10. Standard Python logging integration
11. Exception serialization
12. Schema validation
"""

import json
import logging
import re
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
import sys

# Ensure packages/logger-python is in sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from skyra_logger import (

    SkyraLogger,
    create_skyra_logger,
    SkyraLoggingHandler,
    validate_log_event,
    parse_strict_json,
    is_valid_calendar_timestamp,
)


class TestFunctionalLogger(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.log_dir = Path(self.temp_dir.name)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_01_logger_creation(self):
        """1. Logger creation with valid config."""
        logger = create_skyra_logger(
            project_id="skyra-erp",
            service_name="erp-worker",
            environment="production",
            instance_id="worker-01",
            level="info",
            transport={"type": "stdout"},
        )
        self.assertIsInstance(logger, SkyraLogger)
        status = logger.get_status()
        self.assertEqual(status["project_id"], "skyra-erp")
        self.assertEqual(status["service_name"], "erp-worker")
        self.assertEqual(status["environment"], "production")
        self.assertEqual(status["instance_id"], "worker-01")
        self.assertEqual(status["level"], "info")
        self.assertFalse(status["is_closed"])
        logger.close()

    def test_02_default_configuration(self):
        """2. Default configuration resolution."""
        logger = create_skyra_logger(
            project_id="skyra-test",
            service_name="test-service",
            transport={"type": "stdout"},
        )
        status = logger.get_status()
        self.assertEqual(status["level"], "info")
        self.assertEqual(status["environment"], "production")
        self.assertTrue(status["instance_id"])
        logger.close()

    def test_03_level_filtering(self):
        """3. Level filtering: events below configured level are skipped."""
        logger = create_skyra_logger(
            project_id="skyra-test",
            service_name="test-service",
            level="warn",
            transport={"type": "file", "directory": str(self.log_dir)},
        )

        logger.debug("Debug event should be dropped")
        logger.info("Info event should be dropped")
        logger.warn("Warn event accepted")
        logger.error("Error event accepted")
        logger.flush()

        status = logger.get_status()
        # Only 2 events should be submitted/accepted
        self.assertEqual(status["total_events_submitted"], 2)
        logger.close()

    def test_04_canonical_event_construction(self):
        """4. Canonical event construction adheres to ECS 8.11.0."""
        logger = create_skyra_logger(
            project_id="skyra-orders",
            service_name="order-api",
            environment="production",
            instance_id="api-inst-1",
            transport={"type": "file", "directory": str(self.log_dir)},
        )

        logger.info("Order processed", {
            "component": "order-processor",
            "action": "business.checkout.completed",
            "outcome": "success",
            "duration_ms": 125.5,
            "order_id": "ord-987",
            "tags": ["ecommerce", "checkout"],
        })
        logger.flush()

        active_file = logger.get_status()["active_file"]
        self.assertIsNotNone(active_file)
        with open(active_file, "r", encoding="utf-8") as f:
            lines = [line.strip() for line in f if line.strip()]

        self.assertEqual(len(lines), 1)
        event = parse_strict_json(lines[0])

        self.assertEqual(event["ecs.version"], "8.11.0")
        self.assertEqual(event["log"]["level"], "info")
        self.assertEqual(event["message"], "Order processed")
        self.assertEqual(event["service"]["name"], "order-api")
        self.assertEqual(event["service"]["environment"], "production")
        self.assertEqual(event["skyra"]["project_id"], "skyra-orders")
        self.assertEqual(event["skyra"]["component"], "order-processor")
        self.assertEqual(event["skyra"]["duration_ms"], 125.5)
        self.assertEqual(event["event"]["duration"], 125500000)
        self.assertEqual(event["event"]["action"], "business.checkout.completed")
        self.assertEqual(event["event"]["outcome"], "success")
        self.assertEqual(event["skyra"]["business"]["order_id"], "ord-987")
        self.assertEqual(event["tags"], ["ecommerce", "checkout"])

        logger.close()

    def test_05_uuidv4_generation(self):
        """5. UUIDv4 generation for event.id."""
        uuidv4_regex = re.compile(
            r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$"
        )
        logger = create_skyra_logger(
            project_id="skyra-test",
            service_name="uuid-service",
            transport={"type": "file", "directory": str(self.log_dir)},
        )
        logger.info("Test UUID event")
        logger.flush()

        active_file = logger.get_status()["active_file"]
        with open(active_file, "r", encoding="utf-8") as f:
            line = f.readline().strip()
        event = parse_strict_json(line)
        self.assertTrue(uuidv4_regex.match(event["event"]["id"]))
        logger.close()

    def test_06_utc_timestamps(self):
        """6. Strict UTC timestamps with real calendar date."""
        logger = create_skyra_logger(
            project_id="skyra-test",
            service_name="ts-service",
            transport={"type": "file", "directory": str(self.log_dir)},
        )
        logger.info("Test timestamp event")
        logger.flush()

        active_file = logger.get_status()["active_file"]
        with open(active_file, "r", encoding="utf-8") as f:
            line = f.readline().strip()
        event = parse_strict_json(line)

        ts = event["@timestamp"]
        self.assertTrue(ts.endswith("Z"))
        self.assertTrue(is_valid_calendar_timestamp(ts))
        logger.close()

    def test_07_metadata_normalization(self):
        """7. Metadata normalization (environment aliases, underscore actions)."""
        logger = create_skyra_logger(
            project_id="skyra-test",
            service_name="norm-service",
            environment="dev",  # Legacy environment
            transport={"type": "file", "directory": str(self.log_dir)},
        )
        logger.info("Action test", {"action": "http_request"})  # Underscore action
        logger.flush()

        active_file = logger.get_status()["active_file"]
        with open(active_file, "r", encoding="utf-8") as f:
            line = f.readline().strip()
        event = parse_strict_json(line)

        self.assertEqual(event["service"]["environment"], "development")
        self.assertEqual(event["event"]["action"], "http.request.completed")
        logger.close()

    def test_08_child_logger_behavior(self):
        """8. Child logger behavior with context inheritance."""
        logger = create_skyra_logger(
            project_id="skyra-test",
            service_name="parent-service",
            transport={"type": "file", "directory": str(self.log_dir)},
        )
        child_logger = logger.child({"component": "payment-module", "tenant_id": "tenant-001"})

        child_logger.info("Child log event", {"sub_action": "card_charged"})
        logger.flush()

        active_file = logger.get_status()["active_file"]
        with open(active_file, "r", encoding="utf-8") as f:
            line = f.readline().strip()
        event = parse_strict_json(line)

        self.assertEqual(event["skyra"]["component"], "payment-module")
        self.assertEqual(event["skyra"]["business"]["tenant_id"], "tenant-001")
        self.assertEqual(event["skyra"]["business"]["sub_action"], "card_charged")
        logger.close()

    def test_09_context_manager(self):
        """9. Context manager support (with statement)."""
        with create_skyra_logger(
            project_id="skyra-test",
            service_name="cm-service",
            transport={"type": "file", "directory": str(self.log_dir)},
        ) as logger:
            logger.info("Logged within context manager")

        # After with block, logger is closed automatically
        status = logger.get_status()
        self.assertTrue(status["is_closed"])
        self.assertEqual(status["total_events_written"], 1)

    def test_10_standard_python_logging_integration(self):
        """10. Standard Python logging integration via SkyraLoggingHandler."""
        skyra_logger = create_skyra_logger(
            project_id="skyra-test",
            service_name="stdlib-service",
            transport={"type": "file", "directory": str(self.log_dir)},
        )

        std_logger = logging.getLogger("skyra.test.stdlib")
        std_logger.setLevel(logging.DEBUG)
        handler = SkyraLoggingHandler(skyra_logger=skyra_logger)
        std_logger.addHandler(handler)

        try:
            std_logger.info("Standard info log", extra={"component": "stdlib-adapter", "custom_key": "val123"})
            std_logger.warning("Standard warning log")
            std_logger.error("Standard error log")
            skyra_logger.flush()

            status = skyra_logger.get_status()
            self.assertEqual(status["total_events_written"], 3)

            active_file = status["active_file"]
            with open(active_file, "r", encoding="utf-8") as f:
                lines = [line.strip() for line in f if line.strip()]

            event0 = parse_strict_json(lines[0])
            self.assertEqual(event0["log"]["level"], "info")
            self.assertEqual(event0["log"]["logger"], "skyra.test.stdlib")
            self.assertEqual(event0["skyra"]["component"], "stdlib-adapter")
            self.assertEqual(event0["skyra"]["business"]["custom_key"], "val123")

            event1 = parse_strict_json(lines[1])
            self.assertEqual(event1["log"]["level"], "warn")

            event2 = parse_strict_json(lines[2])
            self.assertEqual(event2["log"]["level"], "error")

        finally:
            std_logger.removeHandler(handler)
            skyra_logger.close()

    def test_11_exception_serialization(self):
        """11. Exception serialization with type, message, and stack trace."""
        logger = create_skyra_logger(
            project_id="skyra-test",
            service_name="exc-service",
            transport={"type": "file", "directory": str(self.log_dir)},
        )

        try:
            raise ValueError("Test computation failure")
        except Exception as exc:
            logger.error("Computation threw error", {"error": exc})

        logger.flush()
        active_file = logger.get_status()["active_file"]
        with open(active_file, "r", encoding="utf-8") as f:
            line = f.readline().strip()
        event = parse_strict_json(line)

        self.assertIn("error", event)
        self.assertEqual(event["error"]["type"], "ValueError")
        self.assertEqual(event["error"]["message"], "Test computation failure")
        self.assertIn("stack_trace", event["error"])
        self.assertIn("ValueError: Test computation failure", event["error"]["stack_trace"])
        logger.close()

    def test_12_schema_validation(self):
        """12. Schema validation: all generated events validate against log-event.schema.json."""
        logger = create_skyra_logger(
            project_id="skyra-schema-test",
            service_name="validator-service",
            environment="staging",
            transport={"type": "file", "directory": str(self.log_dir)},
        )

        logger.info("General info event")
        logger.warn("Warning alert", {"action": "config.update", "component": "auth"})
        logger.error("Error event", {"error": RuntimeError("Sample runtime failure")})
        logger.flush()

        active_file = logger.get_status()["active_file"]
        with open(active_file, "r", encoding="utf-8") as f:
            for line in f:
                if not line.strip():
                    continue
                record = json.loads(line)
                is_valid, errors = validate_log_event(record)
                self.assertTrue(is_valid, f"Log record failed canonical schema validation: {errors}")

        logger.close()


if __name__ == "__main__":
    unittest.main()
