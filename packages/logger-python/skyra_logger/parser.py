"""
Strict JSON parser for Python rejecting duplicate property names.
"""

import json
from typing import Any, Dict, List, Tuple


class DuplicateKeyError(ValueError):
    """Raised when duplicate keys are encountered in a JSON object."""
    def __init__(self, key: str):
        super().__init__(f"Strict JSON Parse Error: Duplicate property key encountered: {key!r}")
        self.key = key


def _strict_pairs_hook(pairs: List[Tuple[str, Any]]) -> Dict[str, Any]:
    obj: Dict[str, Any] = {}
    for key, value in pairs:
        if key in obj:
            raise DuplicateKeyError(key)
        obj[key] = value
    return obj


def parse_strict_json(json_text: str) -> Any:
    """
    Parses a JSON string strictly rejecting duplicate keys.
    """
    stripped = json_text.strip()
    if not stripped:
        raise ValueError("Cannot parse empty JSON string")
    return json.loads(stripped, object_pairs_hook=_strict_pairs_hook)


def parse_jsonl(jsonl_content: str) -> Tuple[List[Any], List[Dict[str, Any]]]:
    """
    Parses a multiline JSONL string line-by-line using strict duplicate key detection.
    Returns (records, errors).
    """
    records: List[Any] = []
    errors: List[Dict[str, Any]] = []

    for line_num, line in enumerate(jsonl_content.splitlines(), start=1):
        stripped = line.strip()
        if not stripped:
            continue
        try:
            parsed = parse_strict_json(stripped)
            records.append(parsed)
        except Exception as err:
            errors.append({"line": line_num, "error": str(err)})

    return records, errors
