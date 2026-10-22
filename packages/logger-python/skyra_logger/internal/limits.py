"""
Resource bounding and sanitization for log messages and metadata.
Prevents memory exhaustion, infinite loops from circular references,
unbounded recursion, and payload bloat.
"""

from decimal import Decimal
from datetime import datetime, date
import uuid
from typing import Any, Dict, List, Optional, Set
from ..config import ResourceLimits, DEFAULT_RESOURCE_LIMITS


def sanitize_message(raw_msg: Any, max_length: int = 8192) -> str:
    """
    Sanitizes and bounds the top-level log message string.
    """
    if raw_msg is None:
        return ""

    if isinstance(raw_msg, str):
        msg_str = raw_msg
    elif isinstance(raw_msg, Exception):
        msg_str = f"{type(raw_msg).__name__}: {str(raw_msg)}"
    else:
        try:
            msg_str = str(raw_msg)
        except Exception:
            msg_str = f"[{type(raw_msg).__name__}]"

    # Normalize control characters (replace carriage returns, null bytes)
    clean = msg_str.replace("\r", " ").replace("\x00", "")

    if len(clean) > max_length:
        truncated_suffix = "...[TRUNCATED]"
        return clean[: max_length - len(truncated_suffix)] + truncated_suffix

    return clean


def sanitize_metadata(
    target: Any,
    limits: Optional[ResourceLimits] = None,
    current_depth: int = 0,
    seen: Optional[Set[int]] = None,
) -> Any:
    """
    Recursively bounds and converts arbitrary metadata structures into JSON-serializable primitives.
    Guarantees:
    - Protection against circular references (using id() tracking).
    - Maximum recursion depth bounding.
    - Maximum dictionary key count bounding.
    - Maximum array/list element count bounding.
    - Safe stringification of non-serializable objects (datetime, Decimal, UUID, bytes, Exception, custom classes).
    - Does not mutate the caller's input structure.
    """
    if limits is None:
        limits = DEFAULT_RESOURCE_LIMITS

    if seen is None:
        seen = set()

    # 1. Primitives
    if target is None:
        return None
    if isinstance(target, bool):
        return target
    if isinstance(target, (int, float)):
        # Check finite
        if target != target or target == float("inf") or target == float("-inf"):
            return None
        return target
    if isinstance(target, str):
        if len(target) > limits.max_message_length:
            return target[: limits.max_message_length - 14] + "...[TRUNCATED]"
        return target

    # 2. Known standard types
    if isinstance(target, (datetime, date)):
        return target.isoformat()
    if isinstance(target, Decimal):
        return float(target)
    if isinstance(target, uuid.UUID):
        return str(target)
    if isinstance(target, bytes):
        try:
            decoded = target.decode("utf-8")
            if len(decoded) > limits.max_message_length:
                return decoded[: limits.max_message_length - 14] + "...[TRUNCATED]"
            return decoded
        except UnicodeDecodeError:
            return f"[bytes: {len(target)} bytes]"

    # 3. Exceptions
    if isinstance(target, Exception):
        exc_dict: Dict[str, Any] = {
            "type": type(target).__name__,
            "message": sanitize_message(str(target), limits.max_message_length),
        }
        if hasattr(target, "code"):
            exc_dict["code"] = getattr(target, "code")
        if getattr(target, "__traceback__", None) is not None:
            import traceback
            exc_dict["stack_trace"] = "".join(
                traceback.format_exception(type(target), target, target.__traceback__)
            )
        return exc_dict

    # 4. Depth bounding
    if current_depth >= limits.max_metadata_depth:
        return "[DEPTH_LIMIT_EXCEEDED]"

    # 5. Circular reference detection
    obj_id = id(target)
    if obj_id in seen:
        return "[CIRCULAR_REFERENCE]"

    # 6. Dictionaries / Mappings
    if isinstance(target, dict):
        seen_copy = set(seen)
        seen_copy.add(obj_id)

        result_dict: Dict[str, Any] = {}
        count = 0

        for k, v in target.items():
            if count >= limits.max_dict_entries:
                result_dict["_truncated"] = True
                break
            key_str = str(k)
            if len(key_str) > 256:
                key_str = key_str[:250] + "..."
            result_dict[key_str] = sanitize_metadata(
                v, limits, current_depth + 1, seen_copy
            )
            count += 1

        return result_dict

    # 7. Sequences (list, tuple, set)
    if isinstance(target, (list, tuple, set)):
        seen_copy = set(seen)
        seen_copy.add(obj_id)

        result_list: List[Any] = []
        for i, item in enumerate(target):
            if i >= limits.max_list_entries:
                result_list.append("[LIST_LIMIT_EXCEEDED]")
                break
            result_list.append(
                sanitize_metadata(item, limits, current_depth + 1, seen_copy)
            )

        return result_list

    # 8. Arbitrary custom classes
    # Check if object has __dict__
    if hasattr(target, "__dict__"):
        seen_copy = set(seen)
        seen_copy.add(obj_id)
        try:
            return sanitize_metadata(
                vars(target), limits, current_depth + 1, seen_copy
            )
        except Exception:
            pass

    # Fallback to string representation
    try:
        rep = str(target)
        if len(rep) > limits.max_message_length:
            return rep[: limits.max_message_length - 14] + "...[TRUNCATED]"
        return rep
    except Exception:
        return f"[{type(target).__name__}]"
