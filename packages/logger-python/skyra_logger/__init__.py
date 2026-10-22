"""
Skyra Logger for Python
Production-grade ECS-compliant structured logging, daily UTC rotation,
size-based rollover, native logging integration, and crash-resilient JSONL transport.
"""

from .config import (
    DEFAULT_MAX_DICT_ENTRIES,
    DEFAULT_MAX_FILE_SIZE_BYTES,
    DEFAULT_MAX_LIST_ENTRIES,
    DEFAULT_MAX_MESSAGE_LENGTH,
    DEFAULT_MAX_METADATA_DEPTH,
    DEFAULT_MAX_PENDING_EVENTS,
    DEFAULT_MAX_QUEUE_MEMORY_BYTES,
    DEFAULT_MAX_SERIALIZED_EVENT_SIZE,
    DEFAULT_RESOURCE_LIMITS,
    FileTransportConfig,
    PermissionsConfig,
    ResolvedSkyraLoggerConfig,
    ResourceLimits,
    RotationConfig,
    StdoutTransportConfig,
    TransportConfig,
    resolve_config,
)
from .context import (
    clear_current_context,
    get_current_context,
    set_current_context,
    skyra_context,
    validate_span_id,
    validate_trace_id,
)
from .event_builder import build_canonical_log_event
from .formatter import format_jsonl_event
from .handlers import JsonlFileTransport, SkyraLoggingHandler, StdoutTransport
from .instrumentation import (
    measure_database,
    measure_database_async,
    measure_job,
    measure_job_async,
    measure_operation,
    measure_operation_async,
)
from .logger import SkyraLogger, create_skyra_logger
from .parser import DuplicateKeyError, parse_jsonl, parse_strict_json
from .redaction import (
    REDACTED_MASK,
    audit_sensitive_data,
    is_sensitive_key,
    redact_sensitive_data,
)
from .schema import LOG_EVENT_SCHEMA_V1
from .types import (
    CanonicalEnvironment,
    EcsClient,
    EcsDatabase,
    EcsError,
    EcsEvent,
    EcsHost,
    EcsHttp,
    EcsHttpRequest,
    EcsHttpResponse,
    EcsJob,
    EcsLog,
    EcsService,
    EcsSpan,
    EcsTrace,
    EcsUrl,
    EcsUser,
    EcsUserAgent,
    Environment,
    EventOutcome,
    LegacyEnvironment,
    LogLevel,
    SkyraLogEvent,
    SkyraMetadata,
    normalize_environment,
    normalize_event_action,
)
from .validator import (
    ValidationError,
    is_valid_calendar_timestamp,
    normalize_log_event,
    validate_log_event,
)

__version__ = "1.0.0"

__all__ = [
    # Core Logger & Factory
    "create_skyra_logger",
    "SkyraLogger",
    "SkyraLoggingHandler",
    # Correlation Context
    "skyra_context",
    "get_current_context",
    "set_current_context",
    "clear_current_context",
    "validate_trace_id",
    "validate_span_id",
    # Instrumentation
    "measure_database",
    "measure_database_async",
    "measure_job",
    "measure_job_async",
    "measure_operation",
    "measure_operation_async",
    # Transports
    "JsonlFileTransport",
    "StdoutTransport",
    # Config & Limits
    "resolve_config",
    "ResolvedSkyraLoggerConfig",
    "ResourceLimits",
    "DEFAULT_RESOURCE_LIMITS",
    "FileTransportConfig",
    "StdoutTransportConfig",
    "RotationConfig",
    "PermissionsConfig",
    # Formatter & Event Builder
    "build_canonical_log_event",
    "format_jsonl_event",
    # Schema & Validation
    "LOG_EVENT_SCHEMA_V1",
    "validate_log_event",
    "normalize_log_event",
    "is_valid_calendar_timestamp",
    "ValidationError",
    # Strict Parser
    "parse_strict_json",
    "DuplicateKeyError",
    "parse_jsonl",
    # Redaction
    "redact_sensitive_data",
    "audit_sensitive_data",
    "is_sensitive_key",
    "REDACTED_MASK",
    # Types & Enums
    "LogLevel",
    "Environment",
    "CanonicalEnvironment",
    "LegacyEnvironment",
    "EventOutcome",
    "EcsEvent",
    "EcsLog",
    "EcsService",
    "EcsHost",
    "EcsTrace",
    "EcsSpan",
    "EcsHttp",
    "EcsHttpRequest",
    "EcsHttpResponse",
    "EcsUrl",
    "EcsClient",
    "EcsUserAgent",
    "EcsUser",
    "EcsDatabase",
    "EcsError",
    "EcsJob",
    "SkyraMetadata",
    "SkyraLogEvent",
    "normalize_environment",
    "normalize_event_action",
    "__version__",
]
