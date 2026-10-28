import * as crypto from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { IAuditPersistencePort } from '../domain/audit-persistence.port.js';
import { type AdminAuditEvent, sanitizeAuditDetails } from '../domain/admin-audit-event.model.js';
import { AuditPersistenceException } from '../../errors/admin.errors.js';

@Injectable()
export class InMemoryAuditRepository implements IAuditPersistencePort {
  private readonly events: AdminAuditEvent[] = [];
  public shouldSimulateFailure = false;

  public async recordAuditEvent(event: AdminAuditEvent): Promise<AdminAuditEvent> {
    if (this.shouldSimulateFailure) {
      throw new AuditPersistenceException('Simulated audit persistence failure for transactional rollback test.');
    }

    const recorded: AdminAuditEvent = {
      ...event,
      id: event.id ?? crypto.randomUUID(),
      details: sanitizeAuditDetails(event.details),
      createdAt: event.createdAt ?? new Date(),
    };

    this.events.push(recorded);
    return recorded;
  }

  public async listAuditEvents(tenantId: string, limit = 50): Promise<AdminAuditEvent[]> {
    return this.events
      .filter((e) => e.tenantId === tenantId)
      .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
      .slice(0, limit);
  }

  public clear(): void {
    this.events.length = 0;
    this.shouldSimulateFailure = false;
  }
}
