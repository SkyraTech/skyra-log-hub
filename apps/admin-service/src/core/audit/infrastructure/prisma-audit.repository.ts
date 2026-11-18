import type { Prisma } from '@prisma/client';
import type { IAuditPersistencePort } from '../domain/audit-persistence.port.js';
import { type AdminAuditEvent, sanitizeAuditDetails } from '../domain/admin-audit-event.model.js';
import { AdminConfigService } from '../../config/admin-config.service.js';
import { adminPrisma } from '../../database/admin-prisma.js';
import { AuditPersistenceException } from '../../errors/admin.errors.js';
export class PrismaAuditRepository implements IAuditPersistencePort {
  constructor(private readonly config: AdminConfigService) {}
  async recordAuditEvent(event: AdminAuditEvent, transaction?: Prisma.TransactionClient): Promise<AdminAuditEvent> {
    try {
      const db = transaction ?? adminPrisma(this.config);
      const row = await db.adminAuditEvent.create({ data: { ...event, details: sanitizeAuditDetails(event.details) as Prisma.InputJsonValue } });
      return row as AdminAuditEvent;
    } catch { throw new AuditPersistenceException('Administrative audit write failed; the mutation was not committed.'); }
  }
  async listAuditEvents(tenantId: string, limit = 50): Promise<AdminAuditEvent[]> {
    return await adminPrisma(this.config).adminAuditEvent.findMany({ where: { tenantId }, take: Math.min(100,Math.max(1,limit)), orderBy: { createdAt: 'desc' } }) as AdminAuditEvent[];
  }
}
