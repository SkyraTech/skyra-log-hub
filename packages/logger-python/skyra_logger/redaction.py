"""
Sensitive data redaction and detection engine for Python logger.
Harden against compound camelCase/snake_case keys, raw JWTs, connection strings,
and circular references.
"""

import re
from typing import Any, Dict, List, Set, Tuple, Optional

REDACTED_MASK = "[REDACTED]"

SENSITIVE_WORDS = [
    "password",
    "passwd",
    "secret",
    "token",
    "authorization",
    "cookie",
    "creditcard",
    "cardnumber",
    "cvv",
    "ssn",
    "pan",
    "apikey",
    "privatekey",
    "secretkey",
    "connectionstring",
    "connstr",
]

BENIGN_KEYS = {
    "key",
    "keys",
    "primarykey",
    "foreignkey",
    "sortkey",
    "partitionkey",
    "cachekey",
    "idkey",
    "keypath",
    "keyboard",
    "keyevent",
}

# Value patterns
SENSITIVE_VALUE_REGEXES = [
    # 1. Private Key PEM blocks
    (re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----"), REDACTED_MASK),
    # 2. Bearer tokens
    (re.compile(r"Bearer\s+[A-Za-z0-9\-._~+/]+=*", re.IGNORECASE), f"Bearer {REDACTED_MASK}"),
    # 3. Raw JWT tokens
    (re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\b"), REDACTED_MASK),
    # 4. URL credentials
    (re.compile(r"([a-zA-Z][a-zA-Z0-9+.-]*://)([^:\s/]+):([^@\s/]+)@"), r"\1\2:" + REDACTED_MASK + "@"),
    # 5. Sensitive URL query parameters
    (re.compile(r"([?&](?:password|passwd|pwd|token|secret|api[_-]?key|access[_-]?token|refresh[_-]?token)=)[^&\s\"']+", re.IGNORECASE), r"\1" + REDACTED_MASK),
    # 6. Credit card numbers
    (re.compile(r"\b(?:\d{4}[ -]?){3}\d{4}\b"), REDACTED_MASK),
    # 7. Embedded key-value secrets in exception messages and strings
    (re.compile(r"\b((?:password|passwd|pwd|secret|api[_-]?key|access[_-]?token|refresh[_-]?token)\s*[:=]\s*)[^\s\"';,]+", re.IGNORECASE), r"\1" + REDACTED_MASK),
]



def is_sensitive_key(key: str) -> bool:
    """
    Checks whether a key is sensitive regardless of casing convention
    (camelCase, snake_case, kebab-case, or UPPERCASE).
    """
    if not isinstance(key, str):
        return False

    clean = key.strip().lower().replace("_", "").replace("-", "").replace(".", "")

    if clean in BENIGN_KEYS:
        return False

    return any(word in clean for word in SENSITIVE_WORDS)


def audit_sensitive_data(
    target: Any, current_path: str = "$", seen: Optional[Set[int]] = None
) -> Tuple[bool, List[str]]:
    """
    Checks whether target contains unredacted credentials or sensitive values.
    Recursion-safe with circular reference tracking.
    """
    if seen is None:
        seen = set()

    detected_paths: List[str] = []

    def _walk(val: Any, path: str):
        if val is None:
            return

        if isinstance(val, str):
            for regex, _repl in SENSITIVE_VALUE_REGEXES:
                if regex.search(val):
                    detected_paths.append(f"{path} (pattern match)")
                    break
            return

        obj_id = id(val)
        if obj_id in seen:
            return  # Circular reference
        seen.add(obj_id)

        if isinstance(val, (list, tuple)):
            for i, item in enumerate(val):
                _walk(item, f"{path}[{i}]")
            return

        if isinstance(val, dict):
            for k, v in val.items():
                sub_path = f"{path}.{k}"
                if is_sensitive_key(str(k)) and v != REDACTED_MASK:
                    detected_paths.append(sub_path)
                _walk(v, sub_path)

    _walk(target, current_path)
    return len(detected_paths) > 0, detected_paths


def redact_sensitive_data(
    target: Any, mask: str = REDACTED_MASK, seen: Optional[Dict[int, Any]] = None
) -> Any:
    """
    Recursively redacts sensitive keys and values from target.
    Non-mutating: creates a new sanitized clone.
    Protected against circular references.
    """
    if target is None:
        return None

    if isinstance(target, str):
        result = target
        for regex, replacement in SENSITIVE_VALUE_REGEXES:
            result = regex.sub(replacement, result)
        return result

    if isinstance(target, (int, float, bool)):
        return target

    if seen is None:
        seen = {}

    obj_id = id(target)
    if obj_id in seen:
        return seen[obj_id]

    if isinstance(target, list):
        copy_list: List[Any] = []
        seen[obj_id] = copy_list
        for item in target:
            copy_list.append(redact_sensitive_data(item, mask, seen))
        return copy_list

    if isinstance(target, tuple):
        return tuple(redact_sensitive_data(item, mask, seen) for item in target)

    if isinstance(target, dict):
        result_dict: Dict[str, Any] = {}
        seen[obj_id] = result_dict
        for k, v in target.items():
            if is_sensitive_key(str(k)):
                result_dict[k] = mask
            else:
                result_dict[k] = redact_sensitive_data(v, mask, seen)
        return result_dict

    if isinstance(target, Exception):
        copy_exc: Dict[str, Any] = {
            "type": type(target).__name__,
            "message": redact_sensitive_data(str(target), mask, seen),
        }
        seen[obj_id] = copy_exc
        return copy_exc

    return target
