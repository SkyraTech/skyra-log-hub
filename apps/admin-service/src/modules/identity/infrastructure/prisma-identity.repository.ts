import type { IIdentityRepositoryPort } from '../domain/identity.repository.port.js';
import type { UserIdentity } from '../domain/identity.model.js';
import { AdminConfigService } from '../../../core/config/admin-config.service.js';
import { adminPrisma } from '../../../core/database/admin-prisma.js';
import type { Prisma } from '@prisma/client';
export class PrismaIdentityRepository implements IIdentityRepositoryPort {
  constructor(private readonly config: AdminConfigService) {}
  private get db() { return adminPrisma(this.config); }
  findById(id: string): Promise<UserIdentity | null> { return this.db.user.findUnique({ where: { id } }); }
  findByIssuerSubject(issuer: string, subject: string, transaction?: Prisma.TransactionClient): Promise<UserIdentity | null> {
    return (transaction ?? this.db).user.findUnique({ where: { issuer_subject: { issuer, subject } } });
  }
  findByEmail(email: string): Promise<UserIdentity[]> { return this.db.user.findMany({ where: { email } }); }
  save(user: UserIdentity): Promise<UserIdentity> {
    const { id, issuer, subject, ...mutable } = user;
    return this.db.user.upsert({ where: { id }, create: user, update: mutable });
  }
}
