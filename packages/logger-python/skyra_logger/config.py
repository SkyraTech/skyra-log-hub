"""
Configuration models, defaults, and validation for Skyra Python Logger.
Aligned with ADR-002, ADR-011, and @skyra/logger-node specification.
"""

import os
import re
import socket
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Literal, Optional, Set, Union

from .types import LogLevel, CanonicalEnvironment, normalize_environment

DEFAULT_MAX_MESSAGE_LENGTH = 8192
DEFAULT_MAX_SERIALIZED_EVENT_SIZE = 256 * 1024  # 256 KiB
DEFAULT_MAX_METADATA_DEPTH = 8
DEFAULT_MAX_DICT_ENTRIES = 128
DEFAULT_MAX_LIST_ENTRIES = 128
DEFAULT_MAX_PENDING_EVENTS = 10_000
DEFAULT_MAX_QUEUE_MEMORY_BYTES = 32 * 1024 * 1024  # 32 MiB
DEFAULT_MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024  # 100 MiB


@dataclass
class ResourceLimits:
    max_message_length: int = DEFAULT_MAX_MESSAGE_LENGTH
    max_serialized_event_size: int = DEFAULT_MAX_SERIALIZED_EVENT_SIZE
    max_metadata_depth: int = DEFAULT_MAX_METADATA_DEPTH
    max_dict_entries: int = DEFAULT_MAX_DICT_ENTRIES
    max_list_entries: int = DEFAULT_MAX_LIST_ENTRIES
    max_pending_events: int = DEFAULT_MAX_PENDING_EVENTS
    max_queue_memory_bytes: int = DEFAULT_MAX_QUEUE_MEMORY_BYTES


DEFAULT_RESOURCE_LIMITS = ResourceLimits()


@dataclass
class RotationConfig:
    interval: Literal["utc-day"] = "utc-day"
    max_file_size_bytes: int = DEFAULT_MAX_FILE_SIZE_BYTES


@dataclass
class PermissionsConfig:
    dir_mode: int = 0o750
    file_mode: int = 0o640


@dataclass
class FileTransportConfig:
    type: Literal["file"] = "file"
    directory: str = "./logs"
    rotation: RotationConfig = field(default_factory=RotationConfig)
    permissions: PermissionsConfig = field(default_factory=PermissionsConfig)


@dataclass
class StdoutTransportConfig:
    type: Literal["stdout"] = "stdout"


TransportConfig = Union[FileTransportConfig, StdoutTransportConfig]


@dataclass
class ResolvedSkyraLoggerConfig:
    project_id: str
    service_name: str
    environment: CanonicalEnvironment
    instance_id: str
    level: LogLevel = "info"
    service_version: Optional[str] = None
    node_name: Optional[str] = None
    transport: TransportConfig = field(default_factory=FileTransportConfig)
    fsync_on_levels: Set[LogLevel] = field(default_factory=lambda: {"error", "fatal"})
    additional_sensitive_keys: List[str] = field(default_factory=list)
    limits: ResourceLimits = field(default_factory=ResourceLimits)
    clock: Callable[[], datetime] = field(default_factory=lambda: lambda: datetime.now(timezone.utc))
    on_error: Optional[Callable[[Exception], None]] = None
    on_drop: Optional[Callable[[int, str], None]] = None


VALID_IDENTIFIER_PATTERN = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
VALID_LEVELS: Set[str] = {"trace", "debug", "info", "warn", "error", "fatal"}


def resolve_config(
    project_id: str,
    service_name: str,
    environment: Optional[str] = None,
    instance_id: Optional[str] = None,
    level: str = "info",
    service_version: Optional[str] = None,
    node_name: Optional[str] = None,
    transport: Optional[Union[Dict[str, Any], TransportConfig]] = None,
    fsync_on_levels: Optional[Union[List[str], Set[str]]] = None,
    additional_sensitive_keys: Optional[List[str]] = None,
    limits: Optional[Union[Dict[str, Any], ResourceLimits]] = None,
    clock: Optional[Callable[[], datetime]] = None,
    on_error: Optional[Callable[[Exception], None]] = None,
    on_drop: Optional[Callable[[int, str], None]] = None,
) -> ResolvedSkyraLoggerConfig:
    """
    Validates and resolves logger configuration into immutable ResolvedSkyraLoggerConfig.
    """
    # 1. Project ID validation
    if not isinstance(project_id, str) or not project_id.strip():
        raise ValueError("Configuration error: 'project_id' must be a non-empty string.")
    clean_project_id = project_id.strip()
    if not VALID_IDENTIFIER_PATTERN.match(clean_project_id) or len(clean_project_id) > 64:
        raise ValueError(
            f"Configuration error: 'project_id' ('{clean_project_id}') must be kebab-case (max 64 chars) matching ^[a-z0-9]+(-[a-z0-9]+)*$."
        )

    # 2. Service Name validation
    if not isinstance(service_name, str) or not service_name.strip():
        raise ValueError("Configuration error: 'service_name' must be a non-empty string.")
    clean_service_name = service_name.strip()
    if not VALID_IDENTIFIER_PATTERN.match(clean_service_name) or len(clean_service_name) > 64:
        raise ValueError(
            f"Configuration error: 'service_name' ('{clean_service_name}') must be kebab-case (max 64 chars) matching ^[a-z0-9]+(-[a-z0-9]+)*$."
        )

    # 3. Environment resolution
    env_str = environment or os.getenv("SKYRA_ENVIRONMENT") or os.getenv("NODE_ENV") or "production"
    canonical_env = normalize_environment(env_str)

    # 4. Instance ID resolution
    inst_id = (
        instance_id
        or os.getenv("SKYRA_INSTANCE_ID")
        or os.getenv("HOSTNAME")
        or socket.gethostname()
        or f"worker-{os.getpid()}"
    )
    clean_inst_id = str(inst_id).strip()
    if not clean_inst_id or len(clean_inst_id) > 128:
        clean_inst_id = f"worker-{os.getpid()}"

    # 5. Log Level
    clean_level = level.lower().strip() if isinstance(level, str) else "info"
    if clean_level not in VALID_LEVELS:
        clean_level = "info"

    # 6. Transport resolution
    resolved_transport: TransportConfig
    if transport is None:
        default_dir = os.getenv("SKYRA_LOG_ROOT") or "./logs"
        resolved_transport = FileTransportConfig(directory=default_dir)
    elif isinstance(transport, (FileTransportConfig, StdoutTransportConfig)):
        resolved_transport = transport
    elif isinstance(transport, dict):
        transport_type = transport.get("type", "file")
        if transport_type == "stdout":
            resolved_transport = StdoutTransportConfig()
        elif transport_type == "file":
            dir_path = transport.get("directory") or os.getenv("SKYRA_LOG_ROOT") or "./logs"
            rot_dict = transport.get("rotation", {})
            rotation = RotationConfig(
                interval=rot_dict.get("interval", "utc-day"),
                max_file_size_bytes=rot_dict.get("max_file_size_bytes", DEFAULT_MAX_FILE_SIZE_BYTES),
            )
            perm_dict = transport.get("permissions", {})
            permissions = PermissionsConfig(
                dir_mode=perm_dict.get("dir_mode", 0o750),
                file_mode=perm_dict.get("file_mode", 0o640),
            )
            resolved_transport = FileTransportConfig(
                directory=dir_path,
                rotation=rotation,
                permissions=permissions,
            )
        else:
            raise ValueError(f"Configuration error: Unsupported transport type '{transport_type}'.")
    else:
        raise ValueError("Configuration error: 'transport' must be a dict or TransportConfig.")

    # 7. Fsync levels
    resolved_fsync: Set[LogLevel]
    if fsync_on_levels is not None:
        resolved_fsync = {lvl.lower() for lvl in fsync_on_levels if lvl.lower() in VALID_LEVELS}  # type: ignore
    else:
        resolved_fsync = {"error", "fatal"}

    # 8. Additional sensitive keys
    clean_additional_keys: List[str] = []
    if additional_sensitive_keys:
        clean_additional_keys = [str(k).strip() for k in additional_sensitive_keys if str(k).strip()]

    # 9. Resource limits
    resolved_limits: ResourceLimits
    if limits is None:
        resolved_limits = DEFAULT_RESOURCE_LIMITS
    elif isinstance(limits, ResourceLimits):
        resolved_limits = limits
    elif isinstance(limits, dict):
        resolved_limits = ResourceLimits(
            max_message_length=int(limits.get("max_message_length", DEFAULT_MAX_MESSAGE_LENGTH)),
            max_serialized_event_size=int(limits.get("max_serialized_event_size", DEFAULT_MAX_SERIALIZED_EVENT_SIZE)),
            max_metadata_depth=int(limits.get("max_metadata_depth", DEFAULT_MAX_METADATA_DEPTH)),
            max_dict_entries=int(limits.get("max_dict_entries", DEFAULT_MAX_DICT_ENTRIES)),
            max_list_entries=int(limits.get("max_list_entries", DEFAULT_MAX_LIST_ENTRIES)),
            max_pending_events=int(limits.get("max_pending_events", DEFAULT_MAX_PENDING_EVENTS)),
            max_queue_memory_bytes=int(limits.get("max_queue_memory_bytes", DEFAULT_MAX_QUEUE_MEMORY_BYTES)),
        )
    else:
        resolved_limits = DEFAULT_RESOURCE_LIMITS

    # 10. Clock
    resolved_clock = clock or (lambda: datetime.now(timezone.utc))

    return ResolvedSkyraLoggerConfig(
        project_id=clean_project_id,
        service_name=clean_service_name,
        environment=canonical_env,
        instance_id=clean_inst_id,
        level=clean_level,  # type: ignore
        service_version=service_version,
        node_name=node_name or clean_inst_id,
        transport=resolved_transport,
        fsync_on_levels=resolved_fsync,
        additional_sensitive_keys=clean_additional_keys,
        limits=resolved_limits,
        clock=resolved_clock,
        on_error=on_error,
        on_drop=on_drop,
    )
