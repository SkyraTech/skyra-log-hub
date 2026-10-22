"""
Rotation, naming, and active file state resolution for JSONL log segments.
Adheres to ADR-011 and contracts/storage-contract.md.
"""

import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Tuple

PART_FILE_REGEX = re.compile(r"^(\d{4}-\d{2}-\d{2})\.part-(\d{4})\.jsonl$")


def format_utc_date(dt: datetime) -> str:
    """
    Returns strict ISO 8601 UTC date string in 'YYYY-MM-DD' format.
    Always uses UTC date representation.
    """
    if dt.tzinfo is None:
        # Assume UTC if naive
        dt_utc = dt.replace(tzinfo=timezone.utc)
    else:
        dt_utc = dt.astimezone(timezone.utc)
    return dt_utc.strftime("%Y-%m-%d")


def format_part_index(index: int) -> str:
    """
    Formats a zero-padded 4-digit segment index (e.g. 0 -> '0000', 1 -> '0001').
    """
    safe = max(0, int(index))
    return f"{safe:04d}"


def build_part_filename(date_str: str, part_index: int) -> str:
    """
    Builds the canonical part filename: ${YYYY-MM-DD}.part-${PART_INDEX}.jsonl
    """
    return f"{date_str}.part-{format_part_index(part_index)}.jsonl"


def parse_part_filename(filename: str) -> Optional[Tuple[str, int]]:
    """
    Parses a candidate filename into (date_str, part_index) if valid, or None.
    """
    match = PART_FILE_REGEX.match(filename)
    if not match:
        return None
    return match.group(1), int(match.group(2))


@dataclass
class ActiveFileState:
    filename: str
    full_path: Path
    date_str: str
    part_index: int
    current_size_bytes: int


def resolve_active_file_state(instance_dir: Path, target_date_str: str) -> ActiveFileState:
    """
    Discovers the active part file for a given UTC date inside an instance directory,
    or determines the initial part index (0000) if no segment exists.
    """
    highest_part = -1
    highest_file: Optional[str] = None
    current_size_bytes = 0

    try:
        if instance_dir.exists():
            for item in instance_dir.iterdir():
                if item.is_file():
                    parsed = parse_part_filename(item.name)
                    if parsed and parsed[0] == target_date_str:
                        if parsed[1] > highest_part:
                            highest_part = parsed[1]
                            highest_file = item.name
    except Exception:
        pass

    part_index = max(0, highest_part)
    filename = highest_file or build_part_filename(target_date_str, part_index)
    full_path = instance_dir / filename

    try:
        if full_path.exists():
            current_size_bytes = full_path.stat().st_size
    except Exception:
        current_size_bytes = 0

    return ActiveFileState(
        filename=filename,
        full_path=full_path,
        date_str=target_date_str,
        part_index=part_index,
        current_size_bytes=current_size_bytes,
    )
