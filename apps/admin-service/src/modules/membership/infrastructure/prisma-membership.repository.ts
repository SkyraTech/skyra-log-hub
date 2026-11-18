import type { IMembershipRepositoryPort } from '../domain/membership.repository.port.js';
import type { TenantMembershipRecord, ProjectMembershipRecord, RoleAssignmentRecord } from '../domain/membership.model.js';
import type { SystemRole } from '../../authorization/domain/role.model.js';
import { AdminConfigService } from '../../../core/config/admin-config.service.js';
import { adminPrisma } from '../../../core/database/admin-prisma.js';
import { LastOwnerProtectionException } from '../../../core/errors/admin.errors.js';
import type { Prisma } from '@prisma/client';
export class PrismaMembershipRepository implements IMembershipRepositoryPort {
  constructor(private readonly config: AdminConfigService) {}
  private get db() { return adminPrisma(this.config); }
  findTenantMembership(tenantId: string, userId: string, transaction?: Prisma.TransactionClient) { return (transaction ?? this.db).tenantMembership.findUnique({ where: { tenantId_userId: { tenantId, userId } } }); }
  listUserTenantMemberships(userId: string) { return this.db.tenantMembership.findMany({ where: { userId } }); }
  findProjectMembership(tenantId: string, projectId: string, userId: string) { return this.db.projectMembership.findUnique({ where: { tenantId_projectId_userId: { tenantId, projectId, userId } } }); }
  listUserProjectMemberships(tenantId: string, userId: string) { return this.db.projectMembership.findMany({ where: { tenantId, userId } }); }
  async listRoleAssignments(tenantId: string, userId: string, transaction?: Prisma.TransactionClient): Promise<RoleAssignmentRecord[]> {
    const rows = await (transaction ?? this.db).roleAssignment.findMany({ where: { tenantId, userId }, include: { role: true } });
    return rows.map(({ role, ...row }) => ({ ...row, role: role.name as SystemRole }));
  }
  async countTenantOwners(tenantId: string) {
    return this.db.tenantMembership.count({ where: { tenantId, status: 'ACTIVE', user: { status: 'ACTIVE', roleAssignments: { some: { tenantId, projectId: null, role: { name: 'OrgOwner' } } } } } });
  }
  saveTenantMembership(m: TenantMembershipRecord) { const { id, ...data } = m; return this.db.tenantMembership.upsert({ where: { tenantId_userId: { tenantId: m.tenantId, userId: m.userId } }, create: m, update: { status: data.status, updatedAt: data.updatedAt } }); }
  saveProjectMembership(m: ProjectMembershipRecord) { return this.db.projectMembership.upsert({ where: { tenantId_projectId_userId: { tenantId: m.tenantId, projectId: m.projectId, userId: m.userId } }, create: m, update: { status: m.status, updatedAt: m.updatedAt } }); }
  async saveRoleAssignment(assignment: RoleAssignmentRecord): Promise<RoleAssignmentRecord> {
    const role = await this.db.role.findUniqueOrThrow({ where: { name: assignment.role } });
    const { role: _, ...row } = assignment;
    // Expression unique index remains the final arbiter of duplicate scope writes.
    const found = await this.db.roleAssignment.findFirst({ where: { tenantId: row.tenantId, userId: row.userId, roleId: role.id, projectId: row.projectId ?? null } });
    if (!found) await this.db.roleAssignment.create({ data: { ...row, roleId: role.id } });
    return { ...assignment, id: found?.id ?? assignment.id };
  }
  async deleteRoleAssignment(_id: string): Promise<void> { throw new Error('Membership mutation requires a separately authorized membership workflow.'); }
  async revokeTenantMembership(tenantId: string, userId: string): Promise<void> {
    await this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM tenants WHERE id=${tenantId}::uuid FOR UPDATE`;
      const owner = await tx.roleAssignment.findFirst({ where: { tenantId, userId, projectId: null, role: { name: 'OrgOwner' } } });
      if (owner) {
        const count = await tx.tenantMembership.count({ where: { tenantId, status: 'ACTIVE', user: { status: 'ACTIVE', roleAssignments: { some: { tenantId, projectId: null, role: { name: 'OrgOwner' } } } } } });
        if (count <= 1) throw new LastOwnerProtectionException('The last active owner cannot be revoked.');
      }
      await tx.tenantMembership.updateMany({ where: { tenantId, userId }, data: { status: 'REVOKED', updatedAt: new Date() } });
      await tx.projectMembership.updateMany({ where: { tenantId, userId }, data: { status: 'REVOKED', updatedAt: new Date() } });
    });
  }
}
