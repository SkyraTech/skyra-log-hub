"""
Canonical Python typing definitions for Skyra Log Event Schema v1.
"""

from typing import Literal, TypedDict, Optional, List, Dict, Any, Union

CanonicalEnvironment = Literal["local", "development", "test", "staging", "production"]
LegacyEnvironment = Literal["dev", "qa"]
Environment = Union[CanonicalEnvironment, LegacyEnvironment]

LogLevel = Literal["fatal", "error", "warn", "info", "debug", "trace"]
EventOutcome = Literal["success", "failure", "unknown"]


def normalize_environment(env: str) -> CanonicalEnvironment:
    """Normalizes legacy environment aliases (e.g. dev -> development, qa -> test)."""
    clean = env.strip().lower()
    if clean == "dev":
        return "development"
    if clean == "qa":
        return "test"
    if clean in ("local", "development", "test", "staging", "production"):
        return clean  # type: ignore
    return clean  # type: ignore


def normalize_event_action(action: str) -> str:
    """Normalizes historical underscore action names to canonical dot-notation."""
    mapping = {
        "http_request": "http.request.completed",
        "sql_query": "database.query.completed",
        "batch_job": "job.execution.completed",
        "user_checkout": "business.checkout.completed",
        "ml_pipeline_step": "process.pipeline.completed",
    }
    return mapping.get(action.strip(), action.strip())


class EcsEvent(TypedDict, total=False):
    id: str
    action: Optional[str]
    dataset: Optional[str]
    category: Optional[List[str]]
    type: Optional[List[str]]
    outcome: Optional[EventOutcome]
    duration: Optional[int]  # nanoseconds


class EcsLog(TypedDict, total=False):
    level: LogLevel
    logger: Optional[str]


class EcsService(TypedDict, total=False):
    name: str
    version: Optional[str]
    environment: Environment


class EcsHost(TypedDict, total=False):
    hostname: Optional[str]
    name: Optional[str]
    ip: Optional[List[str]]
    id: Optional[str]


class EcsTrace(TypedDict, total=False):
    id: str


class EcsSpan(TypedDict, total=False):
    id: str


class EcsHttpRequest(TypedDict, total=False):
    method: str
    id: Optional[str]


class EcsHttpResponse(TypedDict, total=False):
    status_code: int
    bytes: Optional[int]


class EcsHttp(TypedDict, total=False):
    request: Optional[EcsHttpRequest]
    response: Optional[EcsHttpResponse]
    route: Optional[str]


class EcsUrl(TypedDict, total=False):
    path: Optional[str]
    query: Optional[str]
    domain: Optional[str]
    port: Optional[int]


class EcsClient(TypedDict, total=False):
    ip: Optional[str]
    port: Optional[int]


class EcsUserAgent(TypedDict, total=False):
    original: Optional[str]


class EcsUser(TypedDict, total=False):
    id: Optional[str]
    name: Optional[str]
    email: Optional[str]
    roles: Optional[List[str]]


class EcsDatabase(TypedDict, total=False):
    system: Optional[str]
    name: Optional[str]
    operation: Optional[str]
    table: Optional[str]
    statement_sanitized: Optional[str]
    rows_affected: Optional[int]


class EcsError(TypedDict, total=False):
    type: str
    message: str
    code: Optional[Union[str, int]]
    stack_trace: Optional[str]


class EcsJob(TypedDict, total=False):
    name: str
    id: Optional[str]
    queue: Optional[str]
    attempt: Optional[int]
    max_attempts: Optional[int]


class SkyraMetadata(TypedDict, total=False):
    schema_version: str
    project_id: str
    component: Optional[str]
    duration_ms: Optional[float]  # milliseconds
    http: Optional[Dict[str, Any]]
    db: Optional[Dict[str, Any]]
    job: Optional[Dict[str, Any]]
    audit: Optional[Dict[str, Any]]
    security: Optional[Dict[str, Any]]
    business: Optional[Dict[str, Any]]


class SkyraLogEvent(TypedDict, total=False):
    event: EcsEvent
    log: EcsLog
    message: str
    service: EcsService
    skyra: SkyraMetadata
    host: Optional[EcsHost]
    trace: Optional[EcsTrace]
    span: Optional[EcsSpan]
    http: Optional[EcsHttp]
    url: Optional[EcsUrl]
    client: Optional[EcsClient]
    user_agent: Optional[EcsUserAgent]
    user: Optional[EcsUser]
    database: Optional[EcsDatabase]
    error: Optional[EcsError]
    job: Optional[EcsJob]
    labels: Optional[Dict[str, str]]
    tags: Optional[List[str]]
