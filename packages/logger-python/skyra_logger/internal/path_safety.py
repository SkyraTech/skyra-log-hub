"""
Path safety validation for log directory resolution.
Guarantees strict compliance with ADR-011 and contracts/storage-contract.md.
"""

import os
import re
from pathlib import Path

# Safe path component regex: alphanumeric plus hyphens/underscores/dots
SAFE_COMPONENT_REGEX = re.compile(r"^[a-zA-Z0-9_\-\.]+$")


def validate_path_component(name: str, value: str, max_length: int = 128) -> str:
    """
    Validates a single path component against directory traversal and illegal characters.
    """
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"Path safety error: '{name}' cannot be empty.")

    clean = value.strip()
    if len(clean) > max_length:
        raise ValueError(
            f"Path safety error: '{name}' exceeds maximum allowed length of {max_length} characters."
        )

    # Prevent directory traversal attacks
    if ".." in clean or "/" in clean or "\\" in clean:
        raise ValueError(
            f"Path safety error: '{name}' contains illegal path traversal characters ('..', '/', '\\')."
        )

    if not SAFE_COMPONENT_REGEX.match(clean):
        raise ValueError(
            f"Path safety error: '{name}' contains illegal characters: '{clean}'. Allowed: [a-zA-Z0-9_.-]."
        )

    return clean


def resolve_safe_log_directory(
    root_dir: str,
    project_id: str,
    environment: str,
    service_name: str,
    instance_id: str,
) -> Path:
    """
    Resolves and verifies the deterministic instance directory path:
    ${LOG_ROOT}/${PROJECT_ID}/${ENVIRONMENT}/${SERVICE_NAME}/${INSTANCE_ID}/
    """
    if not isinstance(root_dir, str) or not root_dir.strip():
        raise ValueError("Path safety error: Log root directory cannot be empty.")

    safe_project_id = validate_path_component("project_id", project_id, 64)
    safe_environment = validate_path_component("environment", environment, 32)
    safe_service_name = validate_path_component("service_name", service_name, 64)
    safe_instance_id = validate_path_component("instance_id", instance_id, 128)

    resolved_root = Path(root_dir).resolve()
    target_dir = (
        resolved_root
        / safe_project_id
        / safe_environment
        / safe_service_name
        / safe_instance_id
    )

    # Invariant: resolved target directory must be a descendant of root
    try:
        target_dir.relative_to(resolved_root)
    except ValueError:
        raise ValueError(
            f"Path safety error: Target path '{target_dir}' escapes root '{resolved_root}'."
        )

    return target_dir
