"""
Cross-SDK shared fixture compliance test for Skyra Python Logger.
Validates all fixtures in contracts/fixtures/cross-sdk/ against Python Draft 2020-12 validator
and redaction engine.
"""

import json
import unittest
from pathlib import Path
import sys

# Ensure packages/logger-python is in sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from skyra_logger.validator import validate_log_event
from skyra_logger.redaction import redact_sensitive_data
from skyra_logger.parser import parse_strict_json

REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent
FIXTURES_DIR = REPO_ROOT / "contracts" / "fixtures" / "cross-sdk"


class TestCrossSdkFixtures(unittest.TestCase):
    def test_01_valid_fixtures_pass_python_validation(self):
        """All valid cross-SDK fixtures must validate cleanly with Python Draft 2020-12 validator."""
        valid_files = [
            "valid-basic-canonical.json",
            "valid-escaped-unicode.json",
            "valid-date-boundary.json",
            "valid-database-query.json",
            "valid-http-request.json",
            "valid-browser-ui-error.json",
            "valid-background-job.json",
        ]

        for file_name in valid_files:
            file_path = FIXTURES_DIR / file_name
            with open(file_path, "r", encoding="utf-8") as f:
                event = parse_strict_json(f.read())
            valid, errors = validate_log_event(event)
            self.assertTrue(
                valid,
                f"Fixture '{file_name}' failed Python validation: {'; '.join(errors)}"
            )

    def test_02_invalid_fixtures_rejected_by_python_validation(self):
        """All invalid cross-SDK fixtures must be rejected by Python validator."""
        invalid_files = [
            "invalid-missing-mandatory.json",
            "invalid-event-action.json",
            "invalid-malformed-trace-context.json",
            "invalid-bad-severity.json",
            "invalid-unsupported-field-types.json",
        ]

        for file_name in invalid_files:
            file_path = FIXTURES_DIR / file_name
            with open(file_path, "r", encoding="utf-8") as f:
                event = json.loads(f.read())
            valid, errors = validate_log_event(event)
            self.assertFalse(
                valid,
                f"Fixture '{file_name}' unexpectedly passed Python validation when it should be invalid."
            )

    def test_03_sensitive_nested_metadata_redaction(self):
        """Verifies Python redaction engine against security fixture expectations."""
        sec_file = FIXTURES_DIR / "security-sensitive-nested-metadata.json"
        with open(sec_file, "r", encoding="utf-8") as f:
            data = json.loads(f.read())

        unredacted = data["unredacted_input"]
        expected = data["expected_redacted_output"]

        result = redact_sensitive_data(unredacted)
        self.assertEqual(result, expected)


if __name__ == "__main__":
    unittest.main()
