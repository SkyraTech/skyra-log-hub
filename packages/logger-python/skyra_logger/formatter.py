"""
Canonical JSON Lines (JSONL) event formatter.
Conforms strictly to ADR-011 and contracts/storage-contract.md.
"""

import json
from typing import Any, Dict


def format_jsonl_event(event: Dict[str, Any]) -> str:
    """
    Serializes a validated canonical log event dictionary into a single JSONL line.
    Enforces:
    - Exactly one JSON object per line.
    - Unix newline delimiter ('\\n', 0x0A) with no carriage returns ('\\r', 0x0D).
    - Compact separators (',', ':') with no unescaped control characters.
    - UTF-8 representation.
    """
    if not isinstance(event, dict):
        raise TypeError(f"Log event must be a dict, got {type(event).__name__}")

    # Compact JSON serialization without extra whitespace
    serialized = json.dumps(
        event,
        ensure_ascii=False,
        separators=(",", ":"),
    )

    # Invariant: Must not contain raw unescaped newlines or carriage returns
    if "\r" in serialized:
        serialized = serialized.replace("\r", " ")

    # Exactly one trailing newline
    return serialized + "\n"
