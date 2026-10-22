"""
Partial-line crash recovery and corruption quarantine for JSONL files.
Adheres to ADR-011, contracts/storage-contract.md, and @skyra/logger-node recovery specification.
"""

import base64
import hashlib
import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Literal, Optional

from ..parser import parse_strict_json
from .diagnostics import emit_internal_diagnostic


CorruptionType = Literal["incomplete_trailing_line", "malformed_trailing_json"]


@dataclass
class RecoveryResult:
    recovered: bool
    bytes_quarantined: int
    final_size_bytes: int
    quarantine_log_path: Optional[str] = None
    corruption_type: Optional[CorruptionType] = None


def recover_partial_line(
    file_path: Path,
    instance_dir: Path,
    date_str: str,
    enable_forensic: bool = False,
) -> RecoveryResult:
    """
    Checks an existing JSONL file for incomplete trailing lines or partial JSON fragments.
    If found:
    - Safely extracts trailing bytes.
    - Quarantines the corrupt fragment to ${YYYY-MM-DD}.corrupt.log with safe privacy metadata.
    - Cleanly truncates the source .jsonl file back to the last complete newline (\n).

    Guarantees that new records appended to this file are NEVER concatenated onto
    corrupt or incomplete JSON fragments.
    """
    try:
        if not file_path.exists():
            return RecoveryResult(recovered=False, bytes_quarantined=0, final_size_bytes=0)

        total_size = file_path.stat().st_size
        if total_size == 0:
            return RecoveryResult(recovered=False, bytes_quarantined=0, final_size_bytes=0)

        # Inspect tail of the file (up to 128 KiB to cover large structured records)
        read_length = min(total_size, 128 * 1024)
        start_offset = total_size - read_length

        with open(file_path, "rb") as f:
            f.seek(start_offset)
            tail_bytes = f.read(read_length)

        if not tail_bytes:
            return RecoveryResult(recovered=False, bytes_quarantined=0, final_size_bytes=total_size)

        last_byte = tail_bytes[-1]
        needs_recovery = False
        corruption_type: Optional[CorruptionType] = None
        valid_end_offset = total_size

        if last_byte != 0x0A:  # Missing terminal '\n'
            needs_recovery = True
            corruption_type = "incomplete_trailing_line"
        else:
            # File ends with '\n'. Verify that the last record is complete and parseable JSON
            # Find the second-to-last newline
            second_last_nl = -1
            if len(tail_bytes) > 1:
                second_last_nl = tail_bytes.rfind(b"\n", 0, len(tail_bytes) - 1)

            last_line_start = second_last_nl + 1 if second_last_nl >= 0 else 0
            last_line_bytes = tail_bytes[last_line_start:-1]  # Exclude trailing \n
            last_line_str = last_line_bytes.decode("utf-8", errors="replace").strip()

            if last_line_str:
                try:
                    parse_strict_json(last_line_str)
                except Exception:
                    # Last record ends in \n but is malformed / invalid JSON
                    needs_recovery = True
                    corruption_type = "malformed_trailing_json"

        if not needs_recovery:
            return RecoveryResult(recovered=False, bytes_quarantined=0, final_size_bytes=total_size)

        # Locate offset of last complete newline before corruption
        search_end = len(tail_bytes) - 2 if last_byte == 0x0A else len(tail_bytes) - 1
        last_valid_nl_offset_in_chunk = -1
        if search_end >= 0:
            last_valid_nl_offset_in_chunk = tail_bytes.rfind(b"\n", 0, search_end + 1)

        if last_valid_nl_offset_in_chunk >= 0:
            valid_end_offset = start_offset + last_valid_nl_offset_in_chunk + 1
            corrupt_len = total_size - valid_end_offset
            with open(file_path, "rb") as f:
                f.seek(valid_end_offset)
                corrupt_fragment = f.read(corrupt_len)
        elif start_offset == 0:
            # Entire file has no valid newline at all
            valid_end_offset = 0
            corrupt_fragment = tail_bytes
        else:
            # Corrupt line exceeds 128 KiB: read whole file to find earlier newline
            with open(file_path, "rb") as f:
                whole_file = f.read()
            last_nl = whole_file.rfind(b"\n")
            if last_nl >= 0:
                valid_end_offset = last_nl + 1
                corrupt_fragment = whole_file[valid_end_offset:]
            else:
                valid_end_offset = 0
                corrupt_fragment = whole_file

        # Quarantine the corrupt fragment into ${date_str}.corrupt.log
        quarantine_filename = f"{date_str}.corrupt.log"
        quarantine_path = instance_dir / quarantine_filename

        sha256_hash = hashlib.sha256(corrupt_fragment).hexdigest()

        metadata: Dict[str, Any] = {
            "quarantine_timestamp": datetime.now(timezone.utc).isoformat(),
            "source_file": file_path.name,
            "truncate_offset": valid_end_offset,
            "original_file_size": total_size,
            "corrupt_bytes_count": len(corrupt_fragment),
            "corruption_type": corruption_type,
            "sha256_hash": sha256_hash,
            "safe_error_code": "CORRUPT_FRAGMENT_QUARANTINED",
        }

        # Privacy invariant: Only include raw previews if explicitly requested in forensic mode
        if enable_forensic:
            metadata["fragment_utf8_preview"] = corrupt_fragment[:1024].decode("utf-8", errors="replace")
            metadata["fragment_base64"] = base64.b64encode(corrupt_fragment).decode("ascii")

        quarantine_line = (json.dumps(metadata, separators=(",", ":")) + "\n").encode("utf-8")

        # Invariant: Write and fsync quarantine record BEFORE truncating source file
        flags = os.O_CREAT | os.O_APPEND | os.O_WRONLY
        if hasattr(os, "O_BINARY"):
            flags |= os.O_BINARY

        q_fd = os.open(str(quarantine_path), flags, 0o640)
        try:
            os.write(q_fd, quarantine_line)
            if hasattr(os, "fsync"):
                os.fsync(q_fd)
        finally:
            os.close(q_fd)

        # Cleanly truncate source file to the valid newline offset
        with open(file_path, "r+b") as f:
            f.truncate(valid_end_offset)
            f.flush()
            if hasattr(os, "fsync"):
                os.fsync(f.fileno())

        emit_internal_diagnostic(
            "Recovery",
            f"Quarantined {len(corrupt_fragment)} corrupt bytes ({corruption_type}) from "
            f"'{file_path.name}' to '{quarantine_filename}' at offset {valid_end_offset}",
        )

        return RecoveryResult(
            recovered=True,
            bytes_quarantined=len(corrupt_fragment),
            final_size_bytes=valid_end_offset,
            quarantine_log_path=str(quarantine_path),
            corruption_type=corruption_type,
        )

    except Exception as err:
        emit_internal_diagnostic("RecoveryError", f"Failed partial line recovery on '{file_path}'", err)
        return RecoveryResult(recovered=False, bytes_quarantined=0, final_size_bytes=0)
