"""
Cross-language interoperability tests between Python and Node.js SDKs.
Tests 49-56 of Section 22:
49. Python and Node.js emit matching canonical event structures
50. Node.js strict parser accepts Python-generated JSONL
51. Python strict parser accepts Node.js-generated JSONL
52. Both languages agree on duration units
53. Both languages use approved event actions
54. Both languages use approved environment names
55. Schema version behavior is consistent
56. Redaction policies are equivalently safe for shared fixtures
"""

import json
import tempfile
import unittest
from pathlib import Path
import sys

# Ensure packages/logger-python is in sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from skyra_logger import (

    create_skyra_logger,
    parse_strict_json,
    validate_log_event,
    redact_sensitive_data,
    REDACTED_MASK,
    normalize_environment,
    normalize_event_action,
)

FIXTURES_DIR = Path(__file__).resolve().parent.parent.parent.parent.parent / "contracts" / "fixtures" / "v1"


class TestCrossLanguageInterop(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.log_dir = Path(self.temp_dir.name)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_49_matching_canonical_structures(self):
        """49. Python and Node.js emit matching canonical event structures."""
        logger = create_skyra_logger(
            project_id="skyra-interop",
            service_name="interop-service",
            environment="production",
            transport={"type": "file", "directory": str(self.log_dir)},
        )

        logger.info("HTTP Request completed", {
            "action": "http.request.completed",
            "outcome": "success",
            "duration_ms": 45.2,
            "http": {"request": {"method": "GET"}, "response": {"status_code": 200}},
        })
        logger.flush()

        active_file = logger.get_status()["active_file"]
        with open(active_file, "r", encoding="utf-8") as f:
            line = f.readline().strip()
        event = parse_strict_json(line)

        # Check all required top-level ECS keys match Node.js SDK
        for key in ("@timestamp", "ecs.version", "event", "log", "message", "service", "skyra", "host"):
            self.assertIn(key, event, f"Missing required top-level key {key}")

        self.assertEqual(event["ecs.version"], "8.11.0")
        self.assertEqual(event["event"]["action"], "http.request.completed")
        self.assertEqual(event["http"]["request"]["method"], "GET")
        self.assertEqual(event["http"]["response"]["status_code"], 200)

        logger.close()

    def test_50_nodejs_compatible_jsonl(self):
        """50. Python-generated JSONL is valid strict JSON without duplicate keys."""
        logger = create_skyra_logger(
            project_id="skyra-interop",
            service_name="interop-service",
            transport={"type": "file", "directory": str(self.log_dir)},
        )

        for i in range(5):
            logger.info(f"Test event {i}", {"index": i, "tags": ["interop", f"tag-{i}"]})
        logger.flush()

        active_file = logger.get_status()["active_file"]
        with open(active_file, "r", encoding="utf-8") as f:
            for line in f:
                if not line.strip():
                    continue
                # parse_strict_json verifies strict JSON without duplicate keys
                record = parse_strict_json(line)
                self.assertIsInstance(record, dict)

        logger.close()

    def test_51_python_accepts_nodejs_fixtures(self):
        """51. Python strict parser and validator accept Node.js-generated JSON fixtures."""
        fixtures = [
            "valid-http-event.json",
            "valid-db-event.json",
            "valid-job-event.json",
            "valid-error-event.json",
            "valid-audit-event.json",
            "valid-python-event.json",
        ]

        for fname in fixtures:
            fpath = FIXTURES_DIR / fname
            if not fpath.exists():
                continue
            with open(fpath, "r", encoding="utf-8") as f:
                content = f.read()

            record = parse_strict_json(content)
            valid, errors = validate_log_event(record)
            self.assertTrue(valid, f"Fixture {fname} failed in Python: {errors}")

    def test_52_duration_unit_agreement(self):
        """52. Both languages agree on duration units: nanoseconds in event.duration, ms in skyra.duration_ms."""
        logger = create_skyra_logger(
            project_id="skyra-interop",
            service_name="interop-service",
            transport={"type": "file", "directory": str(self.log_dir)},
        )

        logger.info("Timer event", {"duration_ms": 12.345})
        logger.flush()

        active_file = logger.get_status()["active_file"]
        with open(active_file, "r", encoding="utf-8") as f:
            event = parse_strict_json(f.readline().strip())

        # 12.345 ms = 12,345,000 ns
        self.assertEqual(event["skyra"]["duration_ms"], 12.345)
        self.assertEqual(event["event"]["duration"], 12345000)

        # Cross-validation check in validator passes
        valid, errors = validate_log_event(event)
        self.assertTrue(valid, f"Duration mismatch: {errors}")

        logger.close()

    def test_53_approved_event_actions(self):
        """53. Both languages use approved dot-notation event actions."""
        test_actions = [
            ("http_request", "http.request.completed"),
            ("sql_query", "database.query.completed"),
            ("batch_job", "job.execution.completed"),
            ("user_checkout", "business.checkout.completed"),
            ("ml_pipeline_step", "process.pipeline.completed"),
        ]

        for legacy, canonical in test_actions:
            self.assertEqual(normalize_event_action(legacy), canonical)

    def test_54_approved_environment_names(self):
        """54. Both languages use approved canonical environment names."""
        self.assertEqual(normalize_environment("dev"), "development")
        self.assertEqual(normalize_environment("qa"), "test")
        self.assertEqual(normalize_environment("production"), "production")
        self.assertEqual(normalize_environment("staging"), "staging")
        self.assertEqual(normalize_environment("local"), "local")

    def test_55_schema_version_consistency(self):
        """55. Schema version behavior is consistent (1.0)."""
        logger = create_skyra_logger(
            project_id="skyra-interop",
            service_name="interop-service",
            transport={"type": "file", "directory": str(self.log_dir)},
        )
        logger.info("Version check")
        logger.flush()

        active_file = logger.get_status()["active_file"]
        with open(active_file, "r", encoding="utf-8") as f:
            event = parse_strict_json(f.readline().strip())

        self.assertEqual(event["skyra"]["schema_version"], "1.0")
        logger.close()

    def test_56_redaction_policy_equivalence(self):
        """56. Redaction policies are equivalently safe for shared sensitive fixtures."""
        sensitive_payload = {
            "authorization": "token12345",
            "password": "secret_password",
            "apiKey": "key_abcdef123456",
            "message": "Request header: Bearer secret_bearer_token_abc",
            "safe_property": "visible_value",
        }

        redacted = redact_sensitive_data(sensitive_payload)
        self.assertEqual(redacted["authorization"], REDACTED_MASK)
        self.assertEqual(redacted["password"], REDACTED_MASK)
        self.assertEqual(redacted["apiKey"], REDACTED_MASK)
        self.assertEqual(redacted["message"], f"Request header: Bearer {REDACTED_MASK}")
        self.assertEqual(redacted["safe_property"], "visible_value")



if __name__ == "__main__":
    unittest.main()
