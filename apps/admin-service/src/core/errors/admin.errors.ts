export interface Rfc7807ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
  code?: string;
  invalidParams?: Array<{ name: string; reason: string }>;
  [key: string]: unknown;
}

export abstract class AdminException extends Error {
  public abstract readonly statusCode: number;
  public abstract readonly type: string;
  public abstract readonly title: string;
  public readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
  }

  public toProblemDetails(instance?: string): Rfc7807ProblemDetails {
    return {
      type: this.type,
      title: this.title,
      status: this.statusCode,
      detail: this.message,
      code: this.code,
      instance,
    };
  }
}

export class InvalidIdentityAssertionException extends AdminException {
  public readonly statusCode = 401;
  public readonly type = 'https://skyra.io/errors/admin/invalid-identity-assertion';
  public readonly title = 'Invalid Identity Assertion';

  constructor(message: string, code = 'INVALID_IDENTITY_ASSERTION') {
    super(message, code);
  }
}

export class IdentityNotFoundException extends AdminException {
  public readonly statusCode = 404;
  public readonly type = 'https://skyra.io/errors/admin/identity-not-found';
  public readonly title = 'User Identity Not Found';

  constructor(message: string, code = 'IDENTITY_NOT_FOUND') {
    super(message, code);
  }
}

export class DisabledIdentityException extends AdminException {
  public readonly statusCode = 403;
  public readonly type = 'https://skyra.io/errors/admin/disabled-identity';
  public readonly title = 'User Identity Disabled';

  constructor(message: string, code = 'DISABLED_IDENTITY') {
    super(message, code);
  }
}

export class TenantMembershipNotFoundException extends AdminException {
  public readonly statusCode = 403;
  public readonly type = 'https://skyra.io/errors/admin/tenant-membership-not-found';
  public readonly title = 'Tenant Membership Required';

  constructor(message: string, code = 'TENANT_MEMBERSHIP_NOT_FOUND') {
    super(message, code);
  }
}

export class CrossTenantViolationException extends AdminException {
  public readonly statusCode = 403;
  public readonly type = 'https://skyra.io/errors/admin/cross-tenant-violation';
  public readonly title = 'Cross-Tenant Access Forbidden';

  constructor(message: string, code = 'CROSS_TENANT_VIOLATION') {
    super(message, code);
  }
}

export class ForbiddenProjectException extends AdminException {
  public readonly statusCode = 403;
  public readonly type = 'https://skyra.io/errors/admin/forbidden-project';
  public readonly title = 'Forbidden Project Access';

  constructor(message: string, code = 'FORBIDDEN_PROJECT') {
    super(message, code);
  }
}

export class InsufficientPermissionException extends AdminException {
  public readonly statusCode = 403;
  public readonly type = 'https://skyra.io/errors/admin/insufficient-permission';
  public readonly title = 'Insufficient Permissions';

  constructor(message: string, code = 'INSUFFICIENT_PERMISSION') {
    super(message, code);
  }
}

export class LastOwnerProtectionException extends AdminException {
  public readonly statusCode = 409;
  public readonly type = 'https://skyra.io/errors/admin/last-owner-protection';
  public readonly title = 'Last Owner Cannot Be Removed or Downgraded';

  constructor(message: string, code = 'LAST_OWNER_CONFLICT') {
    super(message, code);
  }
}

export class SelfEscalationException extends AdminException {
  public readonly statusCode = 403;
  public readonly type = 'https://skyra.io/errors/admin/self-escalation-forbidden';
  public readonly title = 'Self-Escalation Forbidden';

  constructor(message: string, code = 'SELF_ESCALATION_FORBIDDEN') {
    super(message, code);
  }
}

export class MembershipProviderUnavailableException extends AdminException {
  public readonly statusCode = 503;
  public readonly type = 'https://skyra.io/errors/admin/membership-provider-unavailable';
  public readonly title = 'Membership Directory Unavailable';

  constructor(message: string, code = 'MEMBERSHIP_PROVIDER_UNAVAILABLE') {
    super(message, code);
  }
}

export class AuditPersistenceException extends AdminException {
  public readonly statusCode = 500;
  public readonly type = 'https://skyra.io/errors/admin/audit-persistence-failed';
  public readonly title = 'Administrative Audit Persistence Failed';

  constructor(message: string, code = 'AUDIT_PERSISTENCE_FAILED') {
    super(message, code);
  }
}

export class OptimisticLockConflictException extends AdminException {
  public readonly statusCode = 409;
  public readonly type = 'https://skyra.io/errors/admin/concurrency-conflict';
  public readonly title = 'Resource Concurrency Conflict';

  constructor(message: string, code = 'CONCURRENCY_CONFLICT') {
    super(message, code);
  }
}
