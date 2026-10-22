"""
Security, redaction, envelope defense, and resource bounding tests for Skyra Python Logger.
Tests 37-48 of Section 22:
37. Compound sensitive keys
38. Nested secrets
39. JWT redaction
40. URL credentials
41. Circular references
42. Oversized payloads
43. Deeply nested metadata
44. Invalid trace identifiers
45. Secret-safe exception diagnostics
46. No raw quarantine bytes
47. No canonical field override
48. Every written event validates against the canonical schema
"""

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
    REDACTED_MASK,
)
from skyra_logger.config import ResourceLimits
from skyra_logger.internal.recovery import recover_partial_line


class TestSecurityAndRedaction(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.log_dir = Path(self.temp_dir.name)

    def tearDown(self):
        try:
            self.temp_dir.cleanup()
        except Exception:
            pass


    def test_37_compound_sensitive_keys(self):
        """37. Compound sensitive keys (camelCase, snake_case, UPPERCASE)."""
        logger = create_skyra_logger(
            project_id="skyra-sec",
            service_name="sec-service",
            transport={"type": "file", "directory": str(self.log_dir)},
        )

        logger.info("Credentials update", {
            "userPassword": "SuperSecretPassword123!",
            "api_key_secret": "ak_live_998877665544",
            "AUTH_TOKEN": "Bearer secret_token_xyz",
            "db_connection_string": "Server=tcp:sql.db;Password=secretpass;",
            "paymentCardNumber": "4111 2222 3333 4444",
        })
        logger.flush()

        active_file = logger.get_status()["active_file"]
        with open(active_file, "r", encoding="utf-8") as f:
            line = f.readline().strip()
        event = parse_strict_json(line)
        biz = event["skyra"]["business"]

        self.assertEqual(biz["userPassword"], REDACTED_MASK)
        self.assertEqual(biz["api_key_secret"], REDACTED_MASK)
        self.assertEqual(biz["AUTH_TOKEN"], REDACTED_MASK)
        self.assertEqual(biz["db_connection_string"], REDACTED_MASK)
        self.assertEqual(biz["paymentCardNumber"], REDACTED_MASK)

        logger.close()

    def test_38_nested_secrets(self):
        """38. Nested secrets in deeply nested lists and dictionaries."""
        logger = create_skyra_logger(
            project_id="skyra-sec",
            service_name="sec-service",
            transport={"type": "file", "directory": str(self.log_dir)},
        )

        logger.info("Nested structure", {
            "outer": {
                "middle": [
                    {"account_name": "SkyraCorp", "secret_key": "unmasked_secret"},
                    {"safe_field": 100},
                ]
            }
        })
        logger.flush()

        active_file = logger.get_status()["active_file"]
        with open(active_file, "r", encoding="utf-8") as f:
            line = f.readline().strip()
        event = parse_strict_json(line)
        nested_item = event["skyra"]["business"]["outer"]["middle"][0]

        self.assertEqual(nested_item["account_name"], "SkyraCorp")
        self.assertEqual(nested_item["secret_key"], REDACTED_MASK)

        logger.close()

    def test_39_jwt_redaction(self):
        """39. Raw JWT patterns within strings are redacted."""
        logger = create_skyra_logger(
            project_id="skyra-sec",
            service_name="sec-service",
            transport={"type": "file", "directory": str(self.log_dir)},
        )

        jwt = (
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
            "eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ."
            "SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
        )
        logger.info(f"Session established with token {jwt}")
        logger.flush()

        active_file = logger.get_status()["active_file"]
        with open(active_file, "r", encoding="utf-8") as f:
            line = f.readline().strip()
        event = parse_strict_json(line)

        self.assertNotIn(jwt, event["message"])
        self.assertIn(REDACTED_MASK, event["message"])

        logger.close()

    def test_40_url_credentials(self):
        """40. Embedded credentials in URLs are sanitized."""
        logger = create_skyra_logger(
            project_id="skyra-sec",
            service_name="sec-service",
            transport={"type": "file", "directory": str(self.log_dir)},
        )

        url = "postgres://admin_user:super_secret_pw@db.cluster.internal:5432/orders?ssl=true"
        logger.info(f"Connecting to database url: {url}")
        logger.flush()

        active_file = logger.get_status()["active_file"]
        with open(active_file, "r", encoding="utf-8") as f:
            line = f.readline().strip()
        event = parse_strict_json(line)

        self.assertNotIn("super_secret_pw", event["message"])
        self.assertIn(f"postgres://admin_user:{REDACTED_MASK}@db.cluster.internal:5432/orders?ssl=true", event["message"])

        logger.close()

    def test_41_circular_references(self):
        """41. Circular references in dictionaries and lists do not cause recursion errors."""
        logger = create_skyra_logger(
            project_id="skyra-sec",
            service_name="sec-service",
            transport={"type": "file", "directory": str(self.log_dir)},
        )

        circ_dict = {"name": "circ_root"}
        circ_dict["self_ref"] = circ_dict

        circ_list = [1, 2]
        circ_list.append(circ_list)

        logger.info("Circular test", {"dict": circ_dict, "list": circ_list})
        logger.flush()

        active_file = logger.get_status()["active_file"]
        with open(active_file, "r", encoding="utf-8") as f:
            line = f.readline().strip()
        event = parse_strict_json(line)

        self.assertEqual(event["skyra"]["business"]["dict"]["name"], "circ_root")
        self.assertEqual(event["skyra"]["business"]["dict"]["self_ref"], "[CIRCULAR_REFERENCE]")
        logger.close()

    def test_42_oversized_payloads(self):
        """42. Oversized messages and metadata strings are bounded cleanly."""
        limits = ResourceLimits(max_message_length=100)
        logger = create_skyra_logger(
            project_id="skyra-sec",
            service_name="sec-service",
            limits=limits,
            transport={"type": "file", "directory": str(self.log_dir)},
        )

        huge_string = "A" * 500
        logger.info(huge_string, {"huge_field": huge_string})
        logger.flush()

        active_file = logger.get_status()["active_file"]
        with open(active_file, "r", encoding="utf-8") as f:
            line = f.readline().strip()
        event = parse_strict_json(line)

        self.assertLessEqual(len(event["message"]), 100)
        self.assertTrue(event["message"].endswith("...[TRUNCATED]"))
        self.assertTrue(event["skyra"]["business"]["huge_field"].endswith("...[TRUNCATED]"))

        logger.close()

    def test_43_deeply_nested_metadata(self):
        """43. Deeply nested metadata structures are truncated at max_metadata_depth."""
        limits = ResourceLimits(max_metadata_depth=3)
        logger = create_skyra_logger(
            project_id="skyra-sec",
            service_name="sec-service",
            limits=limits,
            transport={"type": "file", "directory": str(self.log_dir)},
        )

        deep_data = {"l1": {"l2": {"l3": {"l4": {"l5": "too_deep"}}}}}
        logger.info("Deep data test", {"nested": deep_data})
        logger.flush()

        active_file = logger.get_status()["active_file"]
        with open(active_file, "r", encoding="utf-8") as f:
            line = f.readline().strip()
        event = parse_strict_json(line)

        # Depth 3 reached -> "[DEPTH_LIMIT_EXCEEDED]"
        l2 = event["skyra"]["business"]["nested"]["l1"]["l2"]
        self.assertEqual(l2, "[DEPTH_LIMIT_EXCEEDED]")


        logger.close()

    def test_44_invalid_trace_identifiers(self):
        """44. Invalid trace and span identifiers are dropped and never emitted."""
        logger = create_skyra_logger(
            project_id="skyra-sec",
            service_name="sec-service",
            transport={"type": "file", "directory": str(self.log_dir)},
        )

        # Non-hex, wrong length
        logger.info("Invalid trace", {
            "trace_id": "not-valid-hex-32-chars-long-xxx!!",
            "span_id": "wrong-len",
        })
        logger.flush()

        active_file = logger.get_status()["active_file"]
        with open(active_file, "r", encoding="utf-8") as f:
            line = f.readline().strip()
        event = parse_strict_json(line)

        self.assertNotIn("trace", event)
        self.assertNotIn("span", event)

        logger.close()

    def test_45_secret_safe_exception_diagnostics(self):
        """45. Secrets embedded in exception messages are redacted."""
        logger = create_skyra_logger(
            project_id="skyra-sec",
            service_name="sec-service",
            transport={"type": "file", "directory": str(self.log_dir)},
        )

        try:
            raise RuntimeError("Database login failed for user admin password=supersecretpass")
        except Exception as exc:
            logger.error("Operation failed", {"error": exc})

        logger.flush()
        active_file = logger.get_status()["active_file"]
        with open(active_file, "r", encoding="utf-8") as f:
            line = f.readline().strip()
        event = parse_strict_json(line)

        self.assertNotIn("supersecretpass", event["error"]["message"])
        self.assertIn(REDACTED_MASK, event["error"]["message"])

        logger.close()

    def test_46_no_raw_quarantine_bytes(self):
        """46. Quarantine log does not store raw fragment bytes unless forensic mode enabled."""
        inst_dir = self.log_dir / "quarantine-sec-test"
        inst_dir.mkdir(parents=True, exist_ok=True)
        file_path = inst_dir / "2026-10-22.part-0000.jsonl"

        corrupt_tail = '{"password":"super_secret_unredacted_password"'
        with open(file_path, "wb") as f:
            f.write(corrupt_tail.encode("utf-8"))

        # Default recovery (non-forensic)
        result = recover_partial_line(file_path, inst_dir, "2026-10-22", enable_forensic=False)
        self.assertTrue(result.recovered)

        q_path = inst_dir / "2026-10-22.corrupt.log"
        with open(q_path, "r", encoding="utf-8") as f:
            q_line = f.readline()

        # Invariant: Raw password string must not appear anywhere in quarantine log
        self.assertNotIn("super_secret_unredacted_password", q_line)

    def test_47_no_canonical_field_override(self):
        """47. Untrusted caller metadata cannot override mandatory canonical envelope fields."""
        logger = create_skyra_logger(
            project_id="skyra-immutable",
            service_name="real-service",
            environment="production",
            transport={"type": "file", "directory": str(self.log_dir)},
        )

        # Attacker tries to spoof timestamp, event ID, project, service, and schema version
        malicious_metadata = {
            "@timestamp": "1999-01-01T00:00:00.000Z",
            "ecs.version": "0.0.1",
            "event": {"id": "00000000-0000-4000-8000-000000000000"},
            "service": {"name": "spoofed-service", "environment": "dev"},
            "skyra": {"project_id": "spoofed-project", "schema_version": "9.9"},
            "log": {"level": "trace"},
        }

        logger.info("Legitimate event", malicious_metadata)
        logger.flush()

        active_file = logger.get_status()["active_file"]
        with open(active_file, "r", encoding="utf-8") as f:
            line = f.readline().strip()
        event = parse_strict_json(line)

        # Must preserve trusted configuration
        self.assertNotEqual(event["@timestamp"], "1999-01-01T00:00:00.000Z")
        self.assertEqual(event["ecs.version"], "8.11.0")
        self.assertNotEqual(event["event"]["id"], "00000000-0000-4000-8000-000000000000")
        self.assertEqual(event["service"]["name"], "real-service")
        self.assertEqual(event["service"]["environment"], "production")
        self.assertEqual(event["skyra"]["project_id"], "skyra-immutable")
        self.assertEqual(event["skyra"]["schema_version"], "1.0")
        self.assertEqual(event["log"]["level"], "info")

        logger.close()

    def test_48_every_written_event_validates(self):
        """48. Every single written event validates against the canonical schema."""
        logger = create_skyra_logger(
            project_id="skyra-full-audit",
            service_name="audit-service",
            environment="test",
            transport={"type": "file", "directory": str(self.log_dir)},
        )

        test_events = [
            ("Simple message", None),
            ("Database query", {"action": "database.query.completed", "duration_ms": 14.2, "category": ["database"]}),
            ("Job batch", {"action": "job.execution.completed", "duration_ms": 500.0, "category": ["job"]}),
            ("Error event", {"error": ValueError("Calculation error")}),
            ("Custom fields", {"tenant": "t1", "user_count": 50}),
        ]

        for msg, meta in test_events:
            logger.info(msg, meta)

        logger.flush()
        active_file = logger.get_status()["active_file"]
        with open(active_file, "r", encoding="utf-8") as f:
            for line in f:
                if not line.strip():
                    continue
                record = parse_strict_json(line)
                is_valid, errors = validate_log_event(record)
                self.assertTrue(is_valid, f"Canonical validation failed: {errors}")

        logger.close()


if __name__ == "__main__":
    unittest.main()
