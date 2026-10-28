export type AdminAuditAction =
  | 'TENANT_UPDATED'
  | 'PROJECT_CREATED'
  | 'PROJECT_UPDATED'
  | 'PROJECT_DISABLED'
  | 'MEMBER_INVITED'
  | 'MEMBER_ROLE_CHANGED'
  | 'MEMBER_REMOVED'
  | 'CREDENTIAL_CREATED'
  | 'CREDENTIAL_ROTATED'
  | 'CREDENTIAL_REVOKED'
  | 'QUOTA_UPDATED'
  | 'RETENTION_POLICY_CHANGED';

export interface AdminAuditEvent {
  id?: string;
  tenantId: string;
  actorUserId?: string | null;
  actorEmail: string;
  action: AdminAuditAction;
  targetType: 'tenant' | 'project' | 'membership' | 'credential' | 'quota' | 'retention';
  targetId: string;
  details: Record<string, unknown>;
  ipAddress?: string | null;
  createdAt?: Date;
}

/**
 * Sanitizes details payload to ensure no raw passwords, secrets, JWTs, or tokens are persisted in audit trails.
 */
export function sanitizeAuditDetails(details: Record<string, unknown>): Record<string, unknown> {
  const sensitiveKeys = new Set([
    'secret',
    'rawtoken',
    'raw_token',
    'key_hash',
    'token',
    'password',
    'authorization',
    'idtoken',
    'id_token',
    'accesstoken',
    'access_token',
  ]);

  const sanitized: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(details)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.has(lowerKey)) {
      sanitized[key] = '[REDACTED]';
    } else if (val && typeof val === 'object' && !Array.isArray(val)) {
      sanitized[key] = sanitizeAuditDetails(val as Record<string, unknown>);
    } else {
      sanitized[key] = val;
    }
  }

  return sanitized;
}
