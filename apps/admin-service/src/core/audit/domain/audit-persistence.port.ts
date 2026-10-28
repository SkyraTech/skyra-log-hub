import type { AdminAuditEvent } from './admin-audit-event.model.js';

export const AUDIT_PERSISTENCE_PORT = Symbol('AUDIT_PERSISTENCE_PORT');

export interface IAuditPersistencePort {
  /**
   * Persists an administrative audit event.
   * In transactional mode, must throw AuditPersistenceException if persistence fails,
   * causing the enclosing administrative mutation to roll back.
   */
  recordAuditEvent(event: AdminAuditEvent): Promise<AdminAuditEvent>;

  /**
   * Lists audit events for a tenant.
   */
  listAuditEvents(tenantId: string, limit?: number): Promise<AdminAuditEvent[]>;
}
