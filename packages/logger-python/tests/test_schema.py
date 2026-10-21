"""
Automated unit and contract test suite for Skyra Python Logger.
Comprehensive regression and verification suite for LOGHUB-PKG-001B.
"""

import json
import os
import sys
import unittest
from pathlib import Path

# Add packages/logger-python to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from skyra_logger.validator import (
    validate_log_event,
    normalize_log_event,
    is_valid_calendar_timestamp,
)
from skyra_logger.parser import parse_strict_json, parse_jsonl, DuplicateKeyError
from skyra_logger.redaction import (
    audit_sensitive_data,
    redact_sensitive_data,
    is_sensitive_key,
    REDACTED_MASK,
)
from skyra_logger.types import normalize_environment, normalize_event_action
from skyra_logger.schema import LOG_EVENT_SCHEMA_V1

FIXTURES_DIR = Path(__file__).resolve().parent.parent.parent.parent / "contracts" / "fixtures" / "v1"


class TestCanonicalSchemaContract(unittest.TestCase):
    def setUp(self):
        self.assertTrue(FIXTURES_DIR.exists(), f"Fixtures directory not found: {FIXTURES_DIR}")

    def test_valid_fixtures_pass_validation(self):
        """1. Valid log events pass schema validation."""
        valid_files = [
            "valid-http-event.json",
            "valid-db-event.json",
            "valid-job-event.json",
            "valid-error-event.json",
            "valid-audit-event.json",
            "valid-python-event.json",
        ]
        for filename in valid_files:
            file_path = FIXTURES_DIR / filename
            with open(file_path, "r", encoding="utf-8") as f:
                event = json.load(f)
            valid, errors = validate_log_event(event)
            self.assertTrue(valid, f"Fixture {filename} failed validation: {errors}")
            self.assertEqual(len(errors), 0)

    def test_invalid_timestamps_rejected(self):
        """2a. Invalid timestamps are rejected."""
        file_path = FIXTURES_DIR / "invalid-bad-timestamp.json"
        with open(file_path, "r", encoding="utf-8") as f:
            event = json.load(f)
        valid, errors = validate_log_event(event)
        self.assertFalse(valid, "Expected invalid-bad-timestamp.json to fail validation")
        self.assertTrue(any("@timestamp" in err for err in errors), f"Error didn't flag timestamp: {errors}")

    def test_invalid_severity_rejected(self):
        """2b. Invalid severity values are rejected."""
        file_path = FIXTURES_DIR / "invalid-bad-severity.json"
        with open(file_path, "r", encoding="utf-8") as f:
            event = json.load(f)
        valid, errors = validate_log_event(event)
        self.assertFalse(valid, "Expected invalid-bad-severity.json to fail validation")
        self.assertTrue(any("log" in err or "level" in err for err in errors), f"Error didn't flag severity: {errors}")

    def test_missing_mandatory_fields_rejected(self):
        """3. Missing mandatory fields are rejected."""
        file_path = FIXTURES_DIR / "invalid-missing-mandatory.json"
        with open(file_path, "r", encoding="utf-8") as f:
            event = json.load(f)
        valid, errors = validate_log_event(event)
        self.assertFalse(valid, "Expected invalid-missing-mandatory.json to fail validation")
        err_str = " ".join(errors).lower()
        self.assertIn("event", err_str)
        self.assertIn("service", err_str)
        self.assertIn("skyra", err_str)

    def test_duplicate_json_keys_rejected_all_depths(self):
        """4. Duplicate JSON property names are rejected at all depths by strict parser."""
        file_path = FIXTURES_DIR / "invalid-duplicate-keys.jsonl"
        with open(file_path, "r", encoding="utf-8") as f:
            raw_content = f.read()

        records, errors = parse_jsonl(raw_content)
        self.assertEqual(len(records), 0)
        self.assertGreater(len(errors), 0)
        self.assertIn("Duplicate property key", errors[0]["error"])

        # Nested duplicate
        with self.assertRaises(DuplicateKeyError):
            parse_strict_json('{"service": {"name": "a", "name": "b"}}')

        # Inside array
        with self.assertRaises(DuplicateKeyError):
            parse_strict_json('{"items": [1, {"dup": 1, "dup": 2}]}')

        # Unicode escaped duplicate
        with self.assertRaises(DuplicateKeyError):
            parse_strict_json('{"a": 1, "\\u0061": 2}')

    def test_timing_fields_consistent_units(self):
        """5. API and database timing fields have consistent units."""
        event_match = {
            "@timestamp": "2026-10-21T14:32:00.000Z",
            "ecs.version": "8.11.0",
            "event": {
                "id": "a5c68e32-8438-4e4b-9725-b827568c0762",
                "duration": 42000000,
            },
            "log": {"level": "info"},
            "message": "Consistent timing test",
            "service": {"name": "test-svc", "environment": "production"},
            "skyra": {
                "schema_version": "1.0.0",
                "project_id": "test-project",
                "duration_ms": 42.0,
            },
        }
        valid, errors = validate_log_event(event_match)
        self.assertTrue(valid, f"Expected matching timing to pass: {errors}")

        event_mismatch = dict(event_match)
        event_mismatch["event"] = {"id": "a5c68e32-8438-4e4b-9725-b827568c0762", "duration": 100000000}
        valid_bad, errors_bad = validate_log_event(event_mismatch)
        self.assertFalse(valid_bad, "Expected timing mismatch to fail")
        self.assertTrue(any("Timing mismatch" in err for err in errors_bad))

    def test_python_and_typescript_parity(self):
        """6. Python and TypeScript sample fixtures follow the same contract."""
        py_fixture = FIXTURES_DIR / "valid-python-event.json"
        ts_fixture = FIXTURES_DIR / "valid-http-event.json"

        with open(py_fixture, "r", encoding="utf-8") as f:
            py_event = json.load(f)
        with open(ts_fixture, "r", encoding="utf-8") as f:
            ts_event = json.load(f)

        valid_py, errs_py = validate_log_event(py_event)
        valid_ts, errs_ts = validate_log_event(ts_event)

        self.assertTrue(valid_py, f"Python event invalid: {errs_py}")
        self.assertTrue(valid_ts, f"TS event invalid: {errs_ts}")

        common_keys = {"@timestamp", "ecs.version", "event", "log", "message", "service", "skyra"}
        self.assertTrue(common_keys.issubset(py_event.keys()))
        self.assertTrue(common_keys.issubset(ts_event.keys()))

    def test_sensitive_fields_redaction_and_hardening(self):
        """7. Sensitive fields redaction handles compound keys, URLs, JWTs, and circular refs."""
        # 7a. Compound keys
        test_payload = {
            "dbPassword": "secretPassword1",
            "clientSecret": "secretTokenXYZ",
            "stripeApiKey": "sk_live_123456",
            "accessToken": "token_abc",
            "refreshToken": "refresh_def",
            "jwtToken": "jwt_ghi",
            "sessionCookie": "sess=9988",
            "connectionString": "postgres://admin:pass123@db.prod.internal:5432/core",
            "regularKey": "benignValue",
            "cacheKey": "user:123",
            "primaryKey": "pk_456",
        }

        self.assertTrue(is_sensitive_key("dbPassword"))
        self.assertTrue(is_sensitive_key("clientSecret"))
        self.assertTrue(is_sensitive_key("stripeApiKey"))
        self.assertTrue(is_sensitive_key("accessToken"))
        self.assertTrue(is_sensitive_key("jwtToken"))
        self.assertTrue(is_sensitive_key("sessionCookie"))
        self.assertTrue(is_sensitive_key("connectionString"))
        self.assertFalse(is_sensitive_key("cacheKey"))
        self.assertFalse(is_sensitive_key("primaryKey"))
        self.assertFalse(is_sensitive_key("key"))

        redacted = redact_sensitive_data(test_payload)
        self.assertEqual(redacted["dbPassword"], REDACTED_MASK)
        self.assertEqual(redacted["clientSecret"], REDACTED_MASK)
        self.assertEqual(redacted["stripeApiKey"], REDACTED_MASK)
        self.assertEqual(redacted["accessToken"], REDACTED_MASK)
        self.assertEqual(redacted["refreshToken"], REDACTED_MASK)
        self.assertEqual(redacted["jwtToken"], REDACTED_MASK)
        self.assertEqual(redacted["sessionCookie"], REDACTED_MASK)
        self.assertEqual(redacted["connectionString"], REDACTED_MASK)
        self.assertEqual(redacted["regularKey"], "benignValue")
        self.assertEqual(redacted["cacheKey"], "user:123")
        self.assertEqual(redacted["primaryKey"], "pk_456")

        # 7b. Embedded URL credentials and raw JWTs
        text_sample = {
            "url": "postgres://dbadmin:SuperSecretPassword@prod-db.host:5432/analytics",
            "authHeader": "Bearer sk_live_9876543210",
            "jwt": "Token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozGz_W4mupm3_xXQe6_K5UfG_2b_1c_4d",
            "query": "https://api.skyra.io/oauth?client_id=123&token=secretValue9988&redirect_uri=https://app.skyra.io",
        }

        sanitized_text = redact_sensitive_data(text_sample)
        self.assertIn("postgres://dbadmin:[REDACTED]@", sanitized_text["url"])
        self.assertIn(f"Bearer {REDACTED_MASK}", sanitized_text["authHeader"])
        self.assertNotIn("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9", sanitized_text["jwt"])
        self.assertIn(f"token={REDACTED_MASK}", sanitized_text["query"])
        self.assertIn("client_id=123", sanitized_text["query"])

        # 7c. Circular reference safety (must not raise RecursionError)
        circular_dict = {"name": "circular-test"}
        circular_dict["self"] = circular_dict
        sanitized_circular = redact_sensitive_data(circular_dict)
        self.assertIsNotNone(sanitized_circular)

        # 7d. Input immutability
        orig = {"password": "rawSecretPassword"}
        redact_sensitive_data(orig)
        self.assertEqual(orig["password"], "rawSecretPassword")

    def test_optional_sections_and_normalization(self):
        """8. Optional sections and normalization helpers."""
        base_event = {
            "@timestamp": "2026-10-21T14:32:00.000Z",
            "ecs.version": "8.11.0",
            "event": {"id": "a5c68e32-8438-4e4b-9725-b827568c0762"},
            "log": {"level": "info"},
            "message": "Boundary testing",
            "service": {"name": "test-service", "environment": "production"},
            "skyra": {"schema_version": "1.0.0", "project_id": "test-project"},
        }

        # 8a. Invalid HTTP status code
        bad_http = dict(base_event)
        bad_http["http"] = {"request": {"method": "GET"}, "response": {"status_code": 999}}
        valid, errs = validate_log_event(bad_http)
        self.assertFalse(valid, "Expected status_code 999 to be rejected")

        # 8b. Negative duration in event
        bad_dur = dict(base_event)
        bad_dur["event"] = {"id": "a5c68e32-8438-4e4b-9725-b827568c0762", "duration": -50}
        valid_dur, errs_dur = validate_log_event(bad_dur)
        self.assertFalse(valid_dur, "Expected negative duration to be rejected")

        # 8c. Unknown top-level property rejected by additionalProperties: false
        bad_prop = dict(base_event)
        bad_prop["unknownField"] = "forbidden"
        valid_prop, errs_prop = validate_log_event(bad_prop)
        self.assertFalse(valid_prop, "Expected unknown property to be rejected")

        # 8d. Normalization helpers
        self.assertEqual(normalize_environment("dev"), "development")
        self.assertEqual(normalize_environment("qa"), "test")
        self.assertEqual(normalize_environment("production"), "production")

        self.assertEqual(normalize_event_action("http_request"), "http.request.completed")
        self.assertEqual(normalize_event_action("sql_query"), "database.query.completed")
        self.assertEqual(normalize_event_action("custom.action"), "custom.action")

    def test_ecs_version_consistency_and_isolation(self):
        """9. ECS version consistency and isolation from skyra.schema_version."""
        valid_base = {
            "@timestamp": "2026-10-21T14:32:00.000Z",
            "ecs.version": "8.11.0",
            "event": {"id": "a5c68e32-8438-4e4b-9725-b827568c0762"},
            "log": {"level": "info"},
            "message": "ECS version test",
            "service": {"name": "test-svc", "environment": "production"},
            "skyra": {"schema_version": "1.0.0", "project_id": "test-project"},
        }
        valid, errors = validate_log_event(valid_base)
        self.assertTrue(valid, f"Expected 8.11.0 to pass: {errors}")

        for bad_version in ["1.0.0", "8.10.0", "9.0.0", "8.12.0"]:
            bad_event = dict(valid_base)
            bad_event["ecs.version"] = bad_version
            bad_v, bad_errs = validate_log_event(bad_event)
            self.assertFalse(bad_v, f"Expected ecs.version {bad_version} to be rejected")
            self.assertTrue(any("ecs.version" in e for e in bad_errs))

        # skyra.schema_version 8.11.0 rejected because skyra schema follows v1.x
        bad_skyra_event = dict(valid_base)
        bad_skyra_event["skyra"] = {"schema_version": "8.11.0", "project_id": "test-project"}
        bad_sk_v, bad_sk_errs = validate_log_event(bad_skyra_event)
        self.assertFalse(bad_sk_v, "skyra.schema_version 8.11.0 must be rejected")

    def test_uuidv4_strictly_enforced(self):
        """10. UUIDv4 validation strictly enforces version 4 and variant bits."""
        valid_base = {
            "@timestamp": "2026-10-21T14:32:00.000Z",
            "ecs.version": "8.11.0",
            "event": {"id": "a5c68e32-8438-4e4b-9725-b827568c0762"},
            "log": {"level": "info"},
            "message": "UUID test",
            "service": {"name": "uuid-svc", "environment": "production"},
            "skyra": {"schema_version": "1.0.0", "project_id": "test-project"},
        }
        valid, errors = validate_log_event(valid_base)
        self.assertTrue(valid, f"Expected UUIDv4 to pass: {errors}")

        # UUIDv1 rejected
        v1_event = dict(valid_base)
        v1_event["event"] = {"id": "e98e217d-2b99-1d69-8a47-ef92cf856b34"}
        val_v1, err_v1 = validate_log_event(v1_event)
        self.assertFalse(val_v1, "UUIDv1 must be rejected")

        # UUIDv7 rejected
        v7_event = dict(valid_base)
        v7_event["event"] = {"id": "018f217d-2b99-7d69-8a47-ef92cf856b34"}
        val_v7, err_v7 = validate_log_event(v7_event)
        self.assertFalse(val_v7, "UUIDv7 must be rejected")

        # Invalid variant bit
        var_event = dict(valid_base)
        var_event["event"] = {"id": "a5c68e32-8438-4e4b-3725-b827568c0762"}
        val_var, err_var = validate_log_event(var_event)
        self.assertFalse(val_var, "Invalid RFC 4122 variant must be rejected")

        # Malformed non-UUID
        bad_id_event = dict(valid_base)
        bad_id_event["event"] = {"id": "not-a-valid-uuid"}
        val_bad, _ = validate_log_event(bad_id_event)
        self.assertFalse(val_bad, "Malformed UUID must be rejected")

    def test_calendar_timestamp_validity_and_utc(self):
        """11. Calendar validity and UTC boundaries for @timestamp."""
        valid_base = {
            "ecs.version": "8.11.0",
            "event": {"id": "a5c68e32-8438-4e4b-9725-b827568c0762"},
            "log": {"level": "info"},
            "message": "Timestamp test",
            "service": {"name": "ts-svc", "environment": "production"},
            "skyra": {"schema_version": "1.0.0", "project_id": "test-project"},
        }

        # Valid UTC timestamps
        valid_timestamps = [
            "2026-10-21T14:32:00.123Z",
            "2026-10-21T14:32:00.123456789Z",
            "2024-02-29T12:00:00.000Z",  # Leap day 2024
            "2026-01-31T23:59:59.999Z",  # 31-day month
            "2026-04-30T12:00:00.000Z",  # 30-day month
        ]
        for ts in valid_timestamps:
            ev = dict(valid_base)
            ev["@timestamp"] = ts
            val, errs = validate_log_event(ev)
            self.assertTrue(val, f"Expected {ts} to pass: {errs}")

        # Invalid leap days
        for bad_leap in ["2023-02-29T12:00:00.000Z", "2026-02-29T12:00:00.000Z", "2024-02-30T12:00:00.000Z"]:
            ev = dict(valid_base)
            ev["@timestamp"] = bad_leap
            val, errs = validate_log_event(ev)
            self.assertFalse(val, f"Expected leap day {bad_leap} to fail")

        # Invalid month day (April 31)
        ev_april = dict(valid_base)
        ev_april["@timestamp"] = "2026-04-31T12:00:00.000Z"
        val_ap, _ = validate_log_event(ev_april)
        self.assertFalse(val_ap, "April 31st must fail")

        # Invalid month 13
        ev_m13 = dict(valid_base)
        ev_m13["@timestamp"] = "2026-13-01T12:00:00.000Z"
        val_m13, _ = validate_log_event(ev_m13)
        self.assertFalse(val_m13, "Month 13 must fail")

        # Invalid hours, minutes, seconds
        for bad_time in ["2026-10-21T25:00:00.000Z", "2026-10-21T14:60:00.000Z", "2026-10-21T14:30:60.000Z"]:
            ev = dict(valid_base)
            ev["@timestamp"] = bad_time
            val_t, _ = validate_log_event(ev)
            self.assertFalse(val_t, f"Time {bad_time} must fail")

        # Non-UTC
        for non_utc in ["2026-10-21T14:32:00+05:30", "2026-10-21T14:32:00-04:00", "2026-10-21T14:32:00"]:
            ev = dict(valid_base)
            ev["@timestamp"] = non_utc
            val_u, _ = validate_log_event(ev)
            self.assertFalse(val_u, f"Non-UTC {non_utc} must fail")

    def test_schema_synchronization_and_normalization_immutability(self):
        """12. Schema synchronization and safe caller immutability on normalization."""
        canonical_path = Path(__file__).resolve().parent.parent.parent.parent / "contracts" / "schemas" / "v1" / "log-event.schema.json"
        with open(canonical_path, "r", encoding="utf-8") as f:
            canonical_schema = json.load(f)

        self.assertEqual(
            LOG_EVENT_SCHEMA_V1,
            canonical_schema,
            "Python embedded schema must match canonical contracts/schemas/v1/log-event.schema.json",
        )

        unnormalized = {
            "@timestamp": "2026-10-21T14:32:00.000Z",
            "ecs.version": "8.11.0",
            "event": {
                "id": "a5c68e32-8438-4e4b-9725-b827568c0762",
                "action": "http_request",
            },
            "log": {"level": "info"},
            "message": "Python normalization test",
            "service": {"name": "test-svc", "environment": "dev"},
            "skyra": {"schema_version": "1.0.0", "project_id": "test-project"},
        }

        import copy
        frozen_copy = copy.deepcopy(unnormalized)

        normalized = normalize_log_event(unnormalized)

        # Assert caller dict was NOT mutated
        self.assertEqual(unnormalized["service"]["environment"], "dev")
        self.assertEqual(unnormalized["event"]["action"], "http_request")

        # Assert normalized output
        self.assertEqual(normalized["service"]["environment"], "development")
        self.assertEqual(normalized["event"]["action"], "http.request.completed")

        # Assert normalized output validates cleanly
        val, errs = validate_log_event(normalized)
        self.assertTrue(val, f"Normalized event must pass schema validation: {errs}")

    def test_diagnostic_privacy_no_secret_leaks(self):
        """13. Diagnostic privacy: secrets never leaked in validation error messages."""
        secret_password = "SUPER_SECRET_PLAINTEXT_PASSWORD_12345"
        secret_key = "sk_live_SECRET_STRIPE_KEY_ABCDEF"

        bad_payload = {
            "@timestamp": "2026-10-21T14:32:00.000Z",
            "ecs.version": "8.11.0",
            "event": {"id": "a5c68e32-8438-4e4b-9725-b827568c0762"},
            "log": {"level": "info"},
            "message": "Privacy check",
            "service": {"name": "privacy-test", "environment": "production"},
            "skyra": {"schema_version": "1.0.0", "project_id": "test-project"},
            "dbPassword": secret_password,
            "stripeApiKey": secret_key,
        }

        valid, errors = validate_log_event(bad_payload)
        self.assertFalse(valid, "Unknown fields must fail validation")

        all_err_text = " ".join(errors)
        self.assertNotIn(secret_password, all_err_text, "Secret password must not leak in errors")
        self.assertNotIn(secret_key, all_err_text, "Secret key must not leak in errors")


if __name__ == "__main__":
    unittest.main()

