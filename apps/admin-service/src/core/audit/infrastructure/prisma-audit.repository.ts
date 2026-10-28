import { Injectable, Logger } from '@nestjs/common';
import type { IAuditPersistencePort } from '../domain/audit-persistence.port.js';
import { type AdminAuditEvent, sanitizeAuditDetails } from '../domain/admin-audit-event.model.js';
import { AdminConfigService } from '../../config/admin-config.service.js';
import { AuditPersistenceException } from '../../errors/admin.errors.js';

@Injectable()
export class PrismaAuditRepository implements IAuditPersistencePort {
  private readonly logger = new Logger(PrismaAuditRepository.name);

  constructor(private readonly config: AdminConfigService) {}

  public async recordAuditEvent(event: AdminAuditEvent): Promise<AdminAuditEvent> {
    if (!this.config.persistenceEnabled) {
      this.logger.warn('Audit persistence disabled under Gate A safety invariant. Event noted in log stream.');
      return {
        ...event,
        id: event.id ?? 'gate-a-mock-audit-id',
        details: sanitizeAuditDetails(event.details),
        createdAt: event.createdAt ?? new Date(),
      };
    }

    try {
      // In Gate B, this interacts with Prisma client upon database migration approval
      throw new Error('Prisma audit persistence pending Gate B database migration execution.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to record administrative audit event: ${msg}`);
      throw new AuditPersistenceException(`Failed to persist administrative audit record: ${msg}`);
    }
  }

  public async listAuditEvents(tenantId: string, _limit = 50): Promise<AdminAuditEvent[]> {
    if (!this.config.persistenceEnabled) {
      return [];
    }
    throw new AuditPersistenceException('Prisma audit queries pending Gate B database migration execution.');
  }
}
