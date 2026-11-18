import { Injectable, BadRequestException, ForbiddenException, NotFoundException, HttpException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AdminConfigService } from '../../core/config/admin-config.service.js';
import { adminPrisma } from '../../core/database/admin-prisma.js';
import type { TrustedPrincipal } from '../../core/security/trusted-assertion.guard.js';
import { EffectivePermissionResolver } from '../authorization/application/effective-permission.resolver.js';
import type { SystemRole } from '../authorization/domain/role.model.js';
import { PrismaAuditRepository } from '../../core/audit/infrastructure/prisma-audit.repository.js';
import { OptimisticLockConflictException } from '../../core/errors/admin.errors.js';
import { PrismaIdentityRepository } from '../identity/infrastructure/prisma-identity.repository.js';
import { PrismaMembershipRepository } from '../membership/infrastructure/prisma-membership.repository.js';
import { PrismaTenantRepository } from './prisma-tenant.repository.js';

export function organizationName(body: unknown): string {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || !Object.hasOwn(body, 'name')) {
    throw new BadRequestException('Only the name property is accepted.');
  }
  const raw = (body as Record<string, unknown>)['name'];
  if (typeof raw !== 'string') throw new BadRequestException('Name must be a string.');
  const name = raw.trim();
  if (Array.from(name).length < 2 || Array.from(name).length > 255 || name.includes('\0')) {
    throw new BadRequestException('Name must contain 2–255 characters after trimming.');
  }
  return name;
}
export function organizationPrecondition(value: string | undefined, tenantId?: string): string {
  if (!value) throw new HttpException('If-Match is required. Reload the organization before saving.', 428);
  const match = /^"o([0-9a-f-]{36}):([0-9]{1,19})"$/i.exec(value);
  if (!match || BigInt(match[2]!) > 9223372036854775807n) throw new BadRequestException('Invalid If-Match precondition.');
  if (tenantId && match[1] !== tenantId) throw new OptimisticLockConflictException('Organization context changed. Reload before saving.');
  return match[2]!;
}

@Injectable()
export class OrganizationService {
  private readonly tenants = new PrismaTenantRepository();
  constructor(private readonly config: AdminConfigService, private readonly resolver: EffectivePermissionResolver) {}
  private get db() { return adminPrisma(this.config); }
  private async identity(tx: Prisma.TransactionClient, principal: TrustedPrincipal) {
    if (!principal.identityIssuer || !this.config.isIssuerTrusted(principal.identityIssuer)) throw new ForbiddenException('Organization access denied.');
    const user = await new PrismaIdentityRepository(this.config).findByIssuerSubject(principal.identityIssuer, principal.sub, tx);
    if (!user || user.status !== 'ACTIVE') throw new ForbiddenException('Organization access denied.');
    const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM users WHERE id=${user.id}::uuid AND status='ACTIVE' FOR SHARE`;
    if (!locked.length) throw new ForbiddenException('Organization access denied.');
    return user;
  }
  private async authorize(tx: Prisma.TransactionClient, principal: TrustedPrincipal, tenantId: string, capability: 'tenant.read'|'tenant.update') {
    if (principal.scope !== 'organization' || tenantId !== principal.tenantId) throw new ForbiddenException('Organization access denied.');
    if (!/^[0-9a-f-]{36}$/i.test(tenantId)) throw new ForbiddenException('Organization access denied.');
    const user = await this.identity(tx, principal);
    const repository = new PrismaMembershipRepository(this.config);
    const membership = await repository.findTenantMembership(tenantId, user.id, tx);
    if (!membership || membership.status !== 'ACTIVE') throw new ForbiddenException('Organization access denied.');
    const memberships = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM tenant_memberships WHERE tenant_id=${tenantId}::uuid AND user_id=${user.id}::uuid AND status='ACTIVE' FOR SHARE`;
    if (!memberships.length) throw new ForbiddenException('Organization access denied.');
    const roles = await repository.listRoleAssignments(tenantId, user.id, tx);
    const capabilities = this.resolver.resolveEffectiveCapabilities(roles, tenantId);
    this.resolver.assertHasCapability(capabilities, capability);
    return { user, capabilities: [...capabilities].filter(c => c === 'tenant.read' || c === 'tenant.update') };
  }
  private async record(tx: Prisma.TransactionClient, tenantId: string) {
    return this.tenants.read(tx, tenantId);
  }
  read(principal: TrustedPrincipal, tenantId: string) {
    return this.db.$transaction(async tx => {
      if(!/^[0-9a-f-]{36}$/i.test(tenantId))throw new ForbiddenException('Organization access denied.');
      await tx.$queryRaw`SELECT id FROM tenants WHERE id=${tenantId}::uuid FOR SHARE`;
      const { capabilities } = await this.authorize(tx, principal, tenantId, 'tenant.read');
      // Share lock gives the metadata and microsecond ETag one coherent snapshot.
      await tx.$queryRaw`SELECT id FROM tenants WHERE id=${tenantId}::uuid FOR SHARE`;
      return { ...await this.record(tx, tenantId), capabilities };
    });
  }
  update(principal: TrustedPrincipal, tenantId: string, body: unknown, ifMatch: string|undefined, correlationId: string) {
    const name = organizationName(body);
    const version = organizationPrecondition(ifMatch, tenantId);
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM tenants WHERE id=${tenantId}::uuid FOR UPDATE`;
      const { user, capabilities } = await this.authorize(tx, principal, tenantId, 'tenant.update');
      // Row lock protects the audited before value; version condition remains in UPDATE.
      const before = await this.tenants.lock(tx, tenantId);
      if (before.status !== 'ACTIVE') throw new OptimisticLockConflictException('Organization is not active; changes are not permitted.');
      const changed = await this.tenants.updateName(tx, tenantId, name, version);
      if (changed !== 1) throw new OptimisticLockConflictException('Organization changed. Reload before retrying; your draft has not been saved.');
      await new PrismaAuditRepository(this.config).recordAuditEvent({ tenantId, actorUserId: user.id, actorEmail: user.email,
        action: 'TENANT_UPDATED', targetType: 'tenant', targetId: tenantId, createdAt: new Date(),
        details: { before: { name: before.name }, after: { name }, correlationId, outcome: 'SUCCESS' } }, tx);
      return { ...await this.record(tx, tenantId), capabilities };
    }, { timeout: 10000 });
  }
  directory(principal: TrustedPrincipal) {
    if (principal.scope !== 'memberships.resolve') throw new ForbiddenException('Membership access denied.');
    return this.db.$transaction(async tx => {
      const user = await this.identity(tx, principal);
      const memberships = await tx.tenantMembership.findMany({ where: { userId: user.id, status: 'ACTIVE' }, include: { tenant: true }, orderBy: { tenantId: 'asc' } });
      const result = [];
      for (const membership of memberships) {
        const roles = await tx.roleAssignment.findMany({ where: { tenantId: membership.tenantId, userId: user.id }, include: { role: true } });
        const capabilities = [...this.resolver.resolveEffectiveCapabilities(roles.map(row => ({ tenantId: row.tenantId, userId: row.userId, role: row.role.name as SystemRole, projectId: row.projectId })), membership.tenantId)];
        if(membership.tenant.status!=='ACTIVE')continue;
        const scopedMemberships=await tx.projectMembership.findMany({where:{tenantId:membership.tenantId,userId:user.id,status:'ACTIVE'}});
        const projects=await tx.project.findMany({where:{tenantId:membership.tenantId,status:'ACTIVE',...(!capabilities.includes('logs.search')?{id:{in:scopedMemberships.map(m=>m.projectId)}}:{})},orderBy:{id:'asc'}});
        const grants = projects.flatMap(project => {
          const projectCaps = this.resolver.resolveEffectiveCapabilities(roles.map(grant => ({ tenantId: grant.tenantId, userId: grant.userId, role: grant.role.name as SystemRole, projectId: grant.projectId })), membership.tenantId, project.id);
          if (!projectCaps.has('logs.search')) return [];
          const queryRoles = projectCaps.has('projects.update') ? ['admin','analyst','viewer'] : projectCaps.has('logs.analytics') ? ['analyst','viewer'] : ['viewer'];
          return [{ projectId: project.id, projectName: project.name, roles: queryRoles, allowedEnvironments: ['production','staging','development','local'] }];
        });
        result.push({ tenantId: membership.tenantId, tenantName: membership.tenant.name, tenantRoles: roles.filter(row => row.projectId === null).map(row => row.role.name), capabilities, projects: grants });
      }
      return result;
    });
  }
}
