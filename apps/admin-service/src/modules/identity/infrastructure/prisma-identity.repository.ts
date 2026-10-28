import { Injectable, Logger } from '@nestjs/common';
import type { IIdentityRepositoryPort } from '../domain/identity.repository.port.js';
import type { UserIdentity } from '../domain/identity.model.js';
import { AdminConfigService } from '../../../core/config/admin-config.service.js';
import { MembershipProviderUnavailableException } from '../../../core/errors/admin.errors.js';

@Injectable()
export class PrismaIdentityRepository implements IIdentityRepositoryPort {
  private readonly logger = new Logger(PrismaIdentityRepository.name);

  constructor(private readonly config: AdminConfigService) {}

  public async findById(_id: string): Promise<UserIdentity | null> {
    if (!this.config.persistenceEnabled) {
      throw new MembershipProviderUnavailableException('Prisma identity repository inactive under Gate A.');
    }
    throw new Error('Prisma identity operations pending Gate B database migration execution.');
  }

  public async findByIssuerSubject(_issuer: string, _subject: string): Promise<UserIdentity | null> {
    if (!this.config.persistenceEnabled) {
      throw new MembershipProviderUnavailableException('Prisma identity repository inactive under Gate A.');
    }
    throw new Error('Prisma identity operations pending Gate B database migration execution.');
  }

  public async findByEmail(_email: string): Promise<UserIdentity[]> {
    if (!this.config.persistenceEnabled) {
      return [];
    }
    throw new Error('Prisma identity operations pending Gate B database migration execution.');
  }

  public async save(_user: UserIdentity): Promise<UserIdentity> {
    if (!this.config.persistenceEnabled) {
      throw new MembershipProviderUnavailableException('Prisma identity repository inactive under Gate A.');
    }
    throw new Error('Prisma identity operations pending Gate B database migration execution.');
  }
}
