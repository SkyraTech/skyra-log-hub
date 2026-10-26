export interface InvalidParamError {
  name: string;
  reason: string;
}

export abstract class QueryDomainException extends Error {
  public abstract readonly status: number;
  public abstract readonly code: string;
  public abstract readonly title: string;
  public readonly invalidParams?: InvalidParamError[];

  constructor(message: string, invalidParams?: InvalidParamError[]) {
    super(message);
    this.name = this.constructor.name;
    this.invalidParams = invalidParams;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class UnauthorizedException extends QueryDomainException {
  public readonly status = 401;
  public readonly code = 'UNAUTHORIZED';
  public readonly title = 'Authentication Required';

  constructor(detail = 'Missing, expired, or invalid authentication credentials.') {
    super(detail);
  }
}

export class ForbiddenProjectException extends QueryDomainException {
  public readonly status = 403;
  public readonly code = 'FORBIDDEN_PROJECT_ACCESS';
  public readonly title = 'Project Access Denied';

  constructor(detail = 'Principal lacks authorized access to one or more requested projects.') {
    super(detail);
  }
}

export class CrossTenantViolationException extends QueryDomainException {
  public readonly status = 403;
  public readonly code = 'CROSS_TENANT_ACCESS_DENIED';
  public readonly title = 'Cross-Tenant Access Violation';

  constructor(detail = 'Access to resources outside the authenticated tenant boundary is strictly prohibited.') {
    super(detail);
  }
}

export class InvalidArgumentException extends QueryDomainException {
  public readonly status = 400;
  public readonly code = 'INVALID_ARGUMENT';
  public readonly title = 'Invalid Request Parameter';

  constructor(detail: string, invalidParams?: InvalidParamError[]) {
    super(detail, invalidParams);
  }
}

export class TimeRangeExceededException extends QueryDomainException {
  public readonly status = 400;
  public readonly code = 'TIME_RANGE_TOO_LARGE';
  public readonly title = 'Time Range Exceeds Maximum Budget';

  constructor(maxDays: number) {
    super(`Requested search time range exceeds the maximum allowed ceiling of ${maxDays} days.`);
  }
}

export class PathTraversalException extends QueryDomainException {
  public readonly status = 400;
  public readonly code = 'PATH_TRAVERSAL_DETECTED';
  public readonly title = 'Filesystem Security Violation';

  constructor(detail = 'Requested archive path attempts to escape the canonical archive root.') {
    super(detail);
  }
}

export class ArchiveIntegrityException extends QueryDomainException {
  public readonly status = 502;
  public readonly code = 'ARCHIVE_INTEGRITY_MISMATCH';
  public readonly title = 'Archive Manifest Integrity Failure';

  constructor(detail = 'Archived segment checksum or byte size does not match authoritative manifest records.') {
    super(detail);
  }
}

export class ArchiveNotFoundException extends QueryDomainException {
  public readonly status = 404;
  public readonly code = 'ARCHIVE_SEGMENT_NOT_FOUND';
  public readonly title = 'Archive Segment Not Found';

  constructor(detail = 'Referenced archive segment could not be located on disk.') {
    super(detail);
  }
}

export class DatabaseUnavailableException extends QueryDomainException {
  public readonly status = 503;
  public readonly code = 'STORAGE_NOT_READY';
  public readonly title = 'Metadata Catalog Unavailable';

  constructor(detail = 'PostgreSQL metadata catalog is currently unreachable or disconnected.') {
    super(detail);
  }
}

export class NotImplementedException extends QueryDomainException {
  public readonly status = 501;
  public readonly code = 'NOT_IMPLEMENTED';
  public readonly title = 'Feature Not Implemented Yet';

  constructor(detail = 'This endpoint is planned for a subsequent implementation task.') {
    super(detail);
  }
}

export class QueryBudgetExceededException extends QueryDomainException {
  public readonly status = 400;
  public readonly code = 'QUERY_BUDGET_EXCEEDED';
  public readonly title = 'Query Resource Budget Exceeded';

  constructor(detail = 'Query exceeds resource governance budget.') {
    super(detail);
  }
}

export class QueryTimeoutException extends QueryDomainException {
  public readonly status = 504;
  public readonly code = 'QUERY_TIMEOUT';
  public readonly title = 'Query Execution Timeout';

  constructor(detail = 'Analytical query exceeded maximum allotted execution duration.') {
    super(detail);
  }
}

export class QueryCancelledException extends QueryDomainException {
  public readonly status = 400;
  public readonly code = 'QUERY_CANCELLED';
  public readonly title = 'Query Execution Cancelled';

  constructor(detail = 'Analytical query was cancelled by client abort signal.') {
    super(detail);
  }
}

export class DuckDbUnavailableException extends QueryDomainException {
  public readonly status = 503;
  public readonly code = 'ANALYTICAL_ENGINE_UNAVAILABLE';
  public readonly title = 'Analytical Query Engine Unavailable';

  constructor(detail = 'DuckDB execution engine is currently unreachable or disconnected.') {
    super(detail);
  }
}

export class InvalidCursorException extends QueryDomainException {
  public readonly status = 422;
  public readonly code = 'INVALID_CURSOR';
  public readonly title = 'Invalid Pagination Cursor';

  constructor(detail = 'Pagination cursor is invalid, malformed, expired, or tampered.') {
    super(detail);
  }
}

export class CursorScopeMismatchException extends QueryDomainException {
  public readonly status = 403;
  public readonly code = 'FORBIDDEN';
  public readonly title = 'Cursor Scope Mismatch';

  constructor(detail = 'Pagination cursor tenant or scope does not match authenticated principal.') {
    super(detail);
  }
}

export class LogEventNotFoundException extends QueryDomainException {
  public readonly status = 404;
  public readonly code = 'NOT_FOUND';
  public readonly title = 'Log Event Not Found';

  constructor(detail = 'Referenced log event was not found within authorized project scope.') {
    super(detail);
  }
}

export class UnsupportedFilterFieldException extends QueryDomainException {
  public readonly status = 422;
  public readonly code = 'UNSUPPORTED_FILTER_FIELD';
  public readonly title = 'Unsupported Filter Field';

  constructor(detail: string) {
    super(detail);
  }
}

export class UnsupportedFilterOperatorException extends QueryDomainException {
  public readonly status = 422;
  public readonly code = 'UNSUPPORTED_OPERATOR';
  public readonly title = 'Unsupported Filter Operator';

  constructor(detail: string) {
    super(detail);
  }
}

export class AmbiguousLogEventException extends QueryDomainException {
  public readonly status = 409;
  public readonly code = 'AMBIGUOUS_EVENT_ID';
  public readonly title = 'Ambiguous Event Identifier';

  constructor(detail = 'Multiple distinct records match the specified event identifier without a date partition hint.') {
    super(detail);
  }
}

