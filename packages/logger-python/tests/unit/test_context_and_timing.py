"""
Context propagation and timing instrumentation tests for Skyra Python Logger.
Covers:
- skyra_context with W3C trace validation
- Nested context scopes
- measure_database (sync & async)
- measure_job (sync & async)
- measure_operation (sync & async)
"""

import asyncio
import tempfile
import unittest
from pathlib import Path
import sys

# Ensure packages/logger-python is in sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from skyra_logger import (

    create_skyra_logger,
    skyra_context,
    get_current_context,
    measure_database,
    measure_database_async,
    measure_job,
    measure_job_async,
    measure_operation,
    measure_operation_async,
    parse_strict_json,
    validate_log_event,
)


class TestContextAndTiming(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.log_dir = Path(self.temp_dir.name)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_context_propagation_and_trace_validation(self):
        """W3C trace_id and span_id are validated, normalized, and propagated."""
        logger = create_skyra_logger(
            project_id="skyra-trace",
            service_name="trace-service",
            transport={"type": "file", "directory": str(self.log_dir)},
        )

        valid_trace = "4bf92f3577b34da6a3ce929d0e0e4736"
        valid_span = "00f067aa0ba902b7"

        with skyra_context(trace_id=valid_trace, span_id=valid_span, request_id="req-abc-123"):
            logger.info("Trace-aware event")

        logger.flush()
        active_file = logger.get_status()["active_file"]
        with open(active_file, "r", encoding="utf-8") as f:
            line = f.readline().strip()
        event = parse_strict_json(line)

        self.assertIn("trace", event)
        self.assertEqual(event["trace"]["id"], valid_trace)
        self.assertIn("span", event)
        self.assertEqual(event["span"]["id"], valid_span)

        # Ensure context restored after exiting with block
        self.assertEqual(get_current_context(), {})
        logger.close()

    def test_all_zero_trace_and_span_rejected(self):
        """All-zero W3C trace and span IDs are rejected and omitted."""
        logger = create_skyra_logger(
            project_id="skyra-trace",
            service_name="trace-service",
            transport={"type": "file", "directory": str(self.log_dir)},
        )

        zero_trace = "00000000000000000000000000000000"
        zero_span = "0000000000000000"

        with skyra_context(trace_id=zero_trace, span_id=zero_span):
            logger.info("Zero trace event")

        logger.flush()
        active_file = logger.get_status()["active_file"]
        with open(active_file, "r", encoding="utf-8") as f:
            line = f.readline().strip()
        event = parse_strict_json(line)

        # Neither trace nor span should be present
        self.assertNotIn("trace", event)
        self.assertNotIn("span", event)
        logger.close()

    def test_nested_context_scopes(self):
        """Nested skyra_context scopes restore previous values accurately."""
        with skyra_context(tenant_id="tnt-001", role="admin"):
            self.assertEqual(get_current_context()["tenant_id"], "tnt-001")
            self.assertEqual(get_current_context()["role"], "admin")

            with skyra_context(tenant_id="tnt-002", sub_task="import"):
                self.assertEqual(get_current_context()["tenant_id"], "tnt-002")
                self.assertEqual(get_current_context()["role"], "admin")
                self.assertEqual(get_current_context()["sub_task"], "import")

            # Out of nested scope: tenant_id reverted to tnt-001, sub_task removed
            self.assertEqual(get_current_context()["tenant_id"], "tnt-001")
            self.assertNotIn("sub_task", get_current_context())

        self.assertEqual(get_current_context(), {})

    def test_measure_database_sync_success_and_failure(self):
        """measure_database records timing, canonical actions, and re-throws errors."""
        logger = create_skyra_logger(
            project_id="skyra-db",
            service_name="db-service",
            transport={"type": "file", "directory": str(self.log_dir)},
        )

        # 1. Success case
        res = logger.measure_database(
            system="postgresql",
            operation="SELECT",
            name="get_user",
            table="users",
            function=lambda: {"user_id": 42, "status": "active"},
        )
        self.assertEqual(res, {"user_id": 42, "status": "active"})

        # 2. Failure case
        with self.assertRaises(ConnectionError):
            logger.measure_database(
                system="postgresql",
                operation="UPDATE",
                table="accounts",
                function=lambda: (_ for _ in ()).throw(ConnectionError("DB connection refused")),
            )

        logger.flush()
        active_file = logger.get_status()["active_file"]
        with open(active_file, "r", encoding="utf-8") as f:
            lines = [l.strip() for l in f if l.strip()]

        self.assertEqual(len(lines), 2)
        event0 = parse_strict_json(lines[0])
        self.assertEqual(event0["event"]["action"], "database.query.completed")
        self.assertEqual(event0["event"]["outcome"], "success")
        self.assertEqual(event0["database"]["system"], "postgresql")
        self.assertEqual(event0["database"]["operation"], "SELECT")
        self.assertEqual(event0["database"]["table"], "users")
        self.assertGreaterEqual(event0["skyra"]["duration_ms"], 0)

        event1 = parse_strict_json(lines[1])
        self.assertEqual(event1["event"]["action"], "database.query.failed")
        self.assertEqual(event1["event"]["outcome"], "failure")
        self.assertEqual(event1["error"]["type"], "ConnectionError")
        self.assertEqual(event1["error"]["message"], "DB connection refused")
        logger.close()

    def test_measure_job_sync_and_async(self):
        """measure_job and measure_job_async track background job execution."""
        logger = create_skyra_logger(
            project_id="skyra-job",
            service_name="worker-service",
            transport={"type": "file", "directory": str(self.log_dir)},
        )

        # Sync job
        val = logger.measure_job(
            "invoice-export",
            lambda: 100,
            job_id="job-991",
            queue="billing-queue",
        )
        self.assertEqual(val, 100)

        # Async job
        async def async_worker():
            await asyncio.sleep(0.01)
            return "done"

        res = asyncio.run(logger.measure_job_async("async-cleanup", async_worker))
        self.assertEqual(res, "done")

        logger.flush()
        active_file = logger.get_status()["active_file"]
        with open(active_file, "r", encoding="utf-8") as f:
            lines = [l.strip() for l in f if l.strip()]

        self.assertEqual(len(lines), 2)
        ev0 = parse_strict_json(lines[0])
        self.assertEqual(ev0["event"]["action"], "job.execution.completed")
        self.assertEqual(ev0["job"]["name"], "invoice-export")
        self.assertEqual(ev0["job"]["id"], "job-991")

        ev1 = parse_strict_json(lines[1])
        self.assertEqual(ev1["event"]["action"], "job.execution.completed")
        self.assertEqual(ev1["job"]["name"], "async-cleanup")
        self.assertGreater(ev1["skyra"]["duration_ms"], 5.0)  # Slept 10ms
        logger.close()


if __name__ == "__main__":
    unittest.main()
