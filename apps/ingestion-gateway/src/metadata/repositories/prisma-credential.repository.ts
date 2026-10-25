import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service.js';
import type { IngestionCredentialEntity } from '../entities/metadata.entities.js';
import type { ICredentialRepository } from './credential.repository.interface.js';

@Injectable()
export class PrismaCredentialRepository implements ICredentialRepository {
  constructor(private readonly prisma: PrismaService) {}

  public async findByKeyHash(keyHash: string): Promise<IngestionCredentialEntity | null> {
    const cred = await this.prisma.ingestionCredential.findUnique({
      where: { keyHash },
    });
    if (!cred) return null;
    return {
      id: cred.id,
      tenantId: cred.tenantId,
      keyHash: cred.keyHash,
      keyPrefix: cred.keyPrefix,
      description: cred.description,
      allowedProjects: cred.allowedProjects,
      allowedEnvironments: cred.allowedEnvironments,
      rateLimitPerMin: cred.rateLimitPerMin,
      createdAt: cred.createdAt,
      expiresAt: cred.expiresAt,
      isRevoked: cred.isRevoked,
      lastUsedAt: cred.lastUsedAt,
    };
  }

  public async updateLastUsed(id: string, timestamp: Date): Promise<void> {
    await this.prisma.ingestionCredential.update({
      where: { id },
      data: { lastUsedAt: timestamp },
    });
  }

  public async save(credential: IngestionCredentialEntity): Promise<void> {
    await this.prisma.ingestionCredential.upsert({
      where: { id: credential.id },
      create: {
        id: credential.id,
        tenantId: credential.tenantId,
        keyHash: credential.keyHash,
        keyPrefix: credential.keyPrefix,
        description: credential.description,
        allowedProjects: credential.allowedProjects,
        allowedEnvironments: credential.allowedEnvironments,
        rateLimitPerMin: credential.rateLimitPerMin,
        expiresAt: credential.expiresAt,
        isRevoked: credential.isRevoked,
        lastUsedAt: credential.lastUsedAt,
      },
      update: {
        description: credential.description,
        allowedProjects: credential.allowedProjects,
        allowedEnvironments: credential.allowedEnvironments,
        rateLimitPerMin: credential.rateLimitPerMin,
        expiresAt: credential.expiresAt,
        isRevoked: credential.isRevoked,
        lastUsedAt: credential.lastUsedAt,
      },
    });
  }
}
