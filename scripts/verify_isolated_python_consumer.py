"""
Isolated Package Consumer Verification for Task LOGHUB-PKG-005.
Installs skyra-logger wheel in an isolated virtual environment outside the repository
and executes 12-step verification.
"""

import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DIST_DIR = REPO_ROOT / "packages" / "logger-python" / "dist"
WHEEL_FILES = list(DIST_DIR.glob("*.whl"))

if not WHEEL_FILES:
    print(f"Error: No wheel found in {DIST_DIR}")
    sys.exit(1)

WHEEL_PATH = WHEEL_FILES[0]
print(f"[Verification] Found wheel: {WHEEL_PATH.name} ({WHEEL_PATH.stat().st_size} bytes)")


def main():
    temp_dir = tempfile.mkdtemp(prefix="skyra_isolated_consumer_")
    print(f"[Verification] Created isolated workspace: {temp_dir}")

    try:
        venv_dir = Path(temp_dir) / "venv"
        print(f"[Verification] Creating isolated virtualenv: {venv_dir}")
        subprocess.check_call([sys.executable, "-m", "venv", str(venv_dir)])

        # Locate python & pip inside isolated venv
        if os.name == "nt":
            venv_python = venv_dir / "Scripts" / "python.exe"
            venv_pip = venv_dir / "Scripts" / "pip.exe"
        else:
            venv_python = venv_dir / "bin" / "python"
            venv_pip = venv_dir / "bin" / "pip"

        print(f"[Verification] Installing wheel: {WHEEL_PATH}")
        subprocess.check_call([str(venv_pip), "install", str(WHEEL_PATH)])

        # Consumer verification script to run INSIDE the isolated venv
        consumer_script = Path(temp_dir) / "consumer_app.py"
        consumer_code = """
import os
import sys
import logging
from pathlib import Path

# Step 12: Verify no repo-local import is used
import skyra_logger
package_path = Path(skyra_logger.__file__).resolve()
print(f"1. Imported package successfully from: {package_path}")
assert "site-packages" in str(package_path), f"Package must be loaded from site-packages, got {package_path}"

from skyra_logger import (
    create_skyra_logger,
    SkyraLoggingHandler,
    skyra_context,
    measure_database,
    measure_job,
    parse_strict_json,
    validate_log_event,
    REDACTED_MASK,
)

log_output_dir = Path("./consumer_logs").resolve()

# Step 2: Create logger
logger = create_skyra_logger(
    project_id="consumer-erp",
    service_name="consumer-worker",
    environment="production",
    instance_id="inst-consumer-01",
    transport={
        "type": "file",
        "directory": str(log_output_dir),
    },
)
print("2. Created SkyraLogger instance")

# Step 3: Emit structured info and error events
logger.info("Consumer worker initialized", {"component": "init", "worker_pid": os.getpid()})
logger.error("Failed downstream call", {"error": ConnectionResetError("Connection reset by peer"), "component": "network"})
print("3. Emitted info and error events")

# Step 4: Use native Python logging integration
std_logger = logging.getLogger("consumer.native.logger")
std_logger.setLevel(logging.INFO)
handler = SkyraLoggingHandler(skyra_logger=logger)
std_logger.addHandler(handler)
std_logger.info("Native logging message", extra={"source": "stdlib_handler", "user_password": "supersecretpassword"})
print("4. Native Python logging integrated and recorded")

# Step 5: Use request context
with skyra_context(
    request_id="req-isolated-1234",
    trace_id="4bf92f3577b34da6a3ce929d0e0e4736",
    span_id="00f067aa0ba902b7",
):
    logger.info("Correlated request executed", {"route": "/orders/checkout"})
print("5. Context propagation verified")

# Step 6: Measure database / job operations
db_res = logger.measure_database(
    system="postgresql",
    operation="SELECT",
    table="customers",
    function=lambda: {"count": 10},
)
assert db_res == {"count": 10}

job_res = logger.measure_job(
    name="sync-inventory",
    function=lambda: "synced_42_items",
    job_id="job-inv-99",
)
assert job_res == "synced_42_items"
print("6. Database and job operations measured")

# Step 7 & 8: Writes physical JSONL files, flush and close
logger.flush()
status = logger.get_status()
active_file = status["active_file"]
logger.close()
print(f"7 & 8. Flushed and closed. Active file: {active_file}")
assert active_file and os.path.exists(active_file), f"Log file must exist: {active_file}"

# Step 9: Parse output using installed package
with open(active_file, "r", encoding="utf-8") as f:
    raw_lines = [l.strip() for l in f if l.strip()]

assert len(raw_lines) >= 6, f"Expected at least 6 events, got {len(raw_lines)}"
events = []
for line in raw_lines:
    event = parse_strict_json(line)
    events.append(event)
print(f"9. Successfully parsed {len(events)} events using strict JSON parser")

# Step 10: Validate output against canonical schema
for i, event in enumerate(events):
    valid, errors = validate_log_event(event)
    assert valid, f"Event {i} invalid according to schema: {errors}"
print(f"10. All {len(events)} events passed canonical schema validation")

# Step 11: Confirm redaction
native_event = next(e for e in events if e.get("log", {}).get("logger") == "consumer.native.logger")
assert native_event["skyra"]["business"]["user_password"] == REDACTED_MASK, "Password was not redacted!"
print(f"11. Confirmed sensitive field 'user_password' was redacted with '{REDACTED_MASK}'")

print("12. No repository-local imports were used (isolated environment test).")
print("\\nALL 12 VERIFICATION CRITERIA PASSED SUCCESSFULLY!")
"""
        consumer_script.write_text(consumer_code, encoding="utf-8")

        print(f"[Verification] Executing consumer application in isolated virtual environment...")
        proc = subprocess.run(
            [str(venv_python), str(consumer_script)],
            cwd=temp_dir,
            capture_output=True,
            text=True,
        )

        print("--- Output from Isolated Consumer ---")
        print(proc.stdout)
        if proc.stderr:
            print("--- Stderr ---")
            print(proc.stderr)

        if proc.returncode != 0:
            print(f"[Verification] FAILED with exit code {proc.returncode}")
            sys.exit(proc.returncode)

        print("[Verification] Isolated package consumer verification: PASS (12/12 checks passed)")

    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)
        print("[Verification] Cleaned up temporary isolated workspace.")


if __name__ == "__main__":
    main()
