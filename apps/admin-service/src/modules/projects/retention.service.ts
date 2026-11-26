import { Injectable, BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { AdminConfigService } from '../../core/config/admin-config.service.js';
import { adminPrisma } from '../../core/database/admin-prisma.js';
import type { TrustedPrincipal } from '../../core/security/trusted-assertion.guard.js';
import { ProjectsService } from './projects.service.js';
import { PrismaAuditRepository } from '../../core/audit/infrastructure/prisma-audit.repository.js';

export interface RetentionUpdateInput {
  retentionDays?: number;
  enableParquetPurge?: boolean;
  isLegalHold?: boolean;
}

export interface RetentionResponse {
  id: string;
  tenantId: string;
  projectId: string;
  retentionDays: number;
  enableParquetPurge: boolean;
  isLegalHold: boolean;
  updatedAt: string;
}

export function retentionInput(raw: unknown): RetentionUpdateInput {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new BadRequestException('Invalid retention update request.');
  }
  const d = raw as Record<string, unknown>;
  const keys = Object.keys(d);
  if (keys.length === 0) {
    throw new BadRequestException('Retention update payload cannot be empty.');
  }
  const allowed = new Set(['retentionDays', 'enableParquetPurge', 'isLegalHold']);
  for (const k of keys) {
    if (!allowed.has(k)) {
      throw new BadRequestException(`Unsupported retention property "${k}".`);
    }
  }
  const result: RetentionUpdateInput = {};
  if (Object.hasOwn(d, 'retentionDays')) {
    const val = d['retentionDays'];
    if (typeof val !== 'number' || !Number.isInteger(val) || val < 1 || val > 365) {
      throw new BadRequestException('retentionDays must be an integer between 1 and 365.');
    }
    result.retentionDays = val;
  }
  if (Object.hasOwn(d, 'enableParquetPurge')) {
    const val = d['enableParquetPurge'];
    if (typeof val !== 'boolean') {
      throw new BadRequestException('enableParquetPurge must be a boolean.');
    }
    result.enableParquetPurge = val;
  }
  if (Object.hasOwn(d, 'isLegalHold')) {
    const val = d['isLegalHold'];
    if (typeof val !== 'boolean') {
      throw new BadRequestException('isLegalHold must be a boolean.');
    }
    result.isLegalHold = val;
  }
  return result;
}

function deterministicId(tenantId: string, projectId: string): string {
  const h = createHash('sha256').update(`retention:${tenantId}:${projectId}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

@Injectable()
export class RetentionService {
  constructor(
    private readonly config: AdminConfigService,
    private readonly projects: ProjectsService,
  ) {}

  private mapRow(row: any, tenantId: string, projectId: string, defaultDate: Date): RetentionResponse {
    if (!row) {
      return {
        id: deterministicId(tenantId, projectId),
        tenantId,
        projectId,
        retentionDays: 30,
        enableParquetPurge: true,
        isLegalHold: false,
        updatedAt: defaultDate.toISOString(),
      };
    }
    return {
      id: row.id,
      tenantId: row.tenant_id ?? row.tenantId,
      projectId: row.project_id ?? row.projectId,
      retentionDays: row.retention_days ?? row.retentionDays,
      enableParquetPurge: row.enable_parquet_purge ?? row.enableParquetPurge,
      isLegalHold: row.is_legal_hold ?? row.isLegalHold,
      updatedAt: (row.updated_at ?? row.updatedAt).toISOString(),
    };
  }

  async read(p: TrustedPrincipal, tenantId: string, projectId: string): Promise<RetentionResponse> {
    return adminPrisma(this.config).$transaction(async (tx) => {
      const access = await this.projects.retentionAccess(tx, p, tenantId, projectId, false);
      const row = (
        await tx.$queryRaw<any[]>`SELECT * FROM project_retention_policies WHERE tenant_id=${tenantId}::uuid AND project_id=${projectId}`
      )[0];
      return this.mapRow(row, tenantId, projectId, access.project.updatedAt);
    }, { isolationLevel: 'RepeatableRead' });
  }

  async update(
    p: TrustedPrincipal,
    tenantId: string,
    projectId: string,
    raw: unknown,
    correlationId: string,
  ): Promise<RetentionResponse> {
    const input = retentionInput(raw);
    return adminPrisma(this.config).$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'retention/' + tenantId + '/' + projectId}, 0))::text`;
      const access = await this.projects.retentionAccess(tx, p, tenantId, projectId, true);
      if (access.project.status === 'ARCHIVED') {
        throw new ConflictException('Archived project retention policy is read-only.');
      }

      const existingRow = (
        await tx.$queryRaw<any[]>`SELECT * FROM project_retention_policies WHERE tenant_id=${tenantId}::uuid AND project_id=${projectId}`
      )[0];
      const before = this.mapRow(existingRow, tenantId, projectId, access.project.updatedAt);

      // Legal hold security: releasing a legal hold requires elevated OrgOwner authority
      if (before.isLegalHold && input.isLegalHold === false) {
        const isOwner = access.actor.tenantCaps.has('tenant.update') ||
          access.actor.assignments.some(a => a.role === 'OrgOwner');
        if (!isOwner) {
          throw new ForbiddenException('Releasing legal hold requires organization owner authority.');
        }
      }

      const newRetentionDays = input.retentionDays ?? before.retentionDays;
      const newEnableParquetPurge = input.enableParquetPurge ?? before.enableParquetPurge;
      const newIsLegalHold = input.isLegalHold ?? before.isLegalHold;
      const rowId = existingRow?.id ?? randomUUID();

      await tx.$executeRaw`INSERT INTO project_retention_policies(id, tenant_id, project_id, retention_days, enable_parquet_purge, is_legal_hold, created_at, updated_at)
        VALUES(${rowId}::uuid, ${tenantId}::uuid, ${projectId}, ${newRetentionDays}, ${newEnableParquetPurge}, ${newIsLegalHold}, clock_timestamp(), clock_timestamp())
        ON CONFLICT(tenant_id, project_id) DO UPDATE SET
          retention_days = EXCLUDED.retention_days,
          enable_parquet_purge = EXCLUDED.enable_parquet_purge,
          is_legal_hold = EXCLUDED.is_legal_hold,
          updated_at = clock_timestamp()`;

      const updatedRow = (
        await tx.$queryRaw<any[]>`SELECT * FROM project_retention_policies WHERE tenant_id=${tenantId}::uuid AND project_id=${projectId}`
      )[0];
      const after = this.mapRow(updatedRow, tenantId, projectId, access.project.updatedAt);

      await new PrismaAuditRepository(this.config).recordAuditEvent({
        tenantId,
        actorUserId: access.actor.user.id,
        actorEmail: access.actor.user.email,
        action: 'RETENTION_POLICY_CHANGED',
        targetType: 'retention',
        targetId: projectId,
        details: {
          before,
          after,
          correlationId,
          outcome: 'SUCCESS',
        },
      }, tx);

      return after;
    }, { timeout: 10000 });
  }
}
