export interface InvalidParamError {
  name: string;
  reason: string;
}

export abstract class BffDomainException extends Error {
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

export class UnauthorizedException extends BffDomainException {
  public readonly status = 401;
  public readonly code = 'UNAUTHORIZED';
  public readonly title = 'Authentication Required';

  constructor(detail = 'Active browser session is missing, expired, or invalid.') {
    super(detail);
  }
}

export class SessionExpiredException extends BffDomainException {
  public readonly status = 401;
  public readonly code = 'SESSION_EXPIRED';
  public readonly title = 'Session Expired';

  constructor(detail = 'Session has expired due to idle timeout or absolute lifetime limit.') {
    super(detail);
  }
}

export class ForbiddenException extends BffDomainException {
  public readonly status = 403;
  public readonly code = 'FORBIDDEN';
  public readonly title = 'Forbidden';

  constructor(detail = 'Principal lacks authorized access to the requested resource.') {
    super(detail);
  }
}

export class CsrfValidationException extends BffDomainException {
  public readonly status = 403;
  public readonly code = 'CSRF_REJECTED';
  public readonly title = 'CSRF Protection Rejected';

  constructor(detail = 'Request origin verification failed or anti-CSRF token is missing/invalid.') {
    super(detail);
  }
}

export class CrossTenantViolationException extends BffDomainException {
  public readonly status = 403;
  public readonly code = 'CROSS_TENANT_ACCESS_DENIED';
  public readonly title = 'Cross-Tenant Access Violation';

  constructor(detail = 'Access to resources outside the authenticated tenant boundary is strictly prohibited.') {
    super(detail);
  }
}

export class UnauthorizedProjectException extends BffDomainException {
  public readonly status = 403;
  public readonly code = 'UNAUTHORIZED_PROJECT_ACCESS';
  public readonly title = 'Project Access Denied';

  constructor(detail = 'Principal lacks verified membership for the requested project.') {
    super(detail);
  }
}

export class InvalidArgumentException extends BffDomainException {
  public readonly status = 400;
  public readonly code = 'INVALID_ARGUMENT';
  public readonly title = 'Invalid Request Parameter';

  constructor(detail: string, invalidParams?: InvalidParamError[]) {
    super(detail, invalidParams);
  }
}

export class OidcCallbackException extends BffDomainException {
  public readonly status = 400;
  public readonly code = 'OIDC_CALLBACK_FAILED';
  public readonly title = 'OIDC Authentication Callback Failed';

  constructor(detail: string) {
    super(detail);
  }
}

export class UpstreamServiceException extends BffDomainException {
  public readonly status = 502;
  public readonly code = 'UPSTREAM_SERVICE_ERROR';
  public readonly title = 'Upstream Service Error';

  constructor(detail = 'Upstream Query Service returned an error or is unreachable.') {
    super(detail);
  }
}

export class UpstreamTimeoutException extends BffDomainException {
  public readonly status = 504;
  public readonly code = 'UPSTREAM_TIMEOUT';
  public readonly title = 'Upstream Request Timeout';

  constructor(detail = 'Upstream Query Service timed out processing the proxied query.') {
    super(detail);
  }
}

export class MembershipProviderUnavailableException extends BffDomainException {
  public readonly status = 503;
  public readonly code = 'MEMBERSHIP_PROVIDER_UNAVAILABLE';
  public readonly title = 'Authoritative Membership Provider Unavailable';

  constructor(detail = 'Authoritative workspace membership service is not configured or unavailable.') {
    super(detail);
  }
}
