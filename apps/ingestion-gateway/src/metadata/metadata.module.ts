import { Module, type DynamicModule, Global } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';
import { CREDENTIAL_REPOSITORY } from './repositories/credential.repository.interface.js';
import { PROJECT_REPOSITORY } from './repositories/project.repository.interface.js';
import { TENANT_REPOSITORY } from './repositories/tenant.repository.interface.js';
import { QUOTA_REPOSITORY } from './repositories/quota.repository.interface.js';
import { RECEIPT_REPOSITORY } from './repositories/receipt.repository.interface.js';
import { ARCHIVE_SEGMENT_REPOSITORY } from './repositories/archive-segment.repository.interface.js';
import { CHECKPOINT_REPOSITORY } from './repositories/checkpoint.repository.interface.js';

import { InMemoryCredentialRepository } from './repositories/in-memory-credential.repository.js';
import { InMemoryProjectRepository } from './repositories/in-memory-project.repository.js';
import { InMemoryTenantRepository } from './repositories/in-memory-tenant.repository.js';
import { InMemoryQuotaRepository } from './repositories/in-memory-quota.repository.js';
import { InMemoryReceiptRepository } from './repositories/in-memory-receipt.repository.js';
import { InMemoryArchiveSegmentRepository } from './repositories/in-memory-archive-segment.repository.js';
import { InMemoryCheckpointRepository } from './repositories/in-memory-checkpoint.repository.js';

import { PrismaCredentialRepository } from './repositories/prisma-credential.repository.js';
import { PrismaProjectRepository } from './repositories/prisma-project.repository.js';
import { PrismaTenantRepository } from './repositories/prisma-tenant.repository.js';
import { PrismaQuotaRepository } from './repositories/prisma-quota.repository.js';
import { PrismaReceiptRepository } from './repositories/prisma-receipt.repository.js';
import { PrismaArchiveSegmentRepository } from './repositories/prisma-archive-segment.repository.js';
import { PrismaCheckpointRepository } from './repositories/prisma-checkpoint.repository.js';

import { ConfigModule } from '../config/config.module.js';
import { ConfigService } from '../config/config.service.js';

@Global()
@Module({})
export class MetadataModule {
  public static forRoot(options?: { useInMemory?: boolean }): DynamicModule {
    const isInMemory = options?.useInMemory ?? false;

    if (isInMemory && process.env['NODE_ENV'] === 'production') {
      throw new Error('Security violation: In-memory metadata repositories are strictly forbidden in production mode.');
    }

    if (isInMemory) {
      const inMemoryCredRepo = new InMemoryCredentialRepository();
      const inMemoryProjRepo = new InMemoryProjectRepository();
      const inMemoryTenantRepo = new InMemoryTenantRepository();
      const inMemoryQuotaRepo = new InMemoryQuotaRepository();
      const inMemoryReceiptRepo = new InMemoryReceiptRepository();
      const inMemoryArchiveRepo = new InMemoryArchiveSegmentRepository();
      const inMemoryCheckpointRepo = new InMemoryCheckpointRepository();

      return {
        module: MetadataModule,
        imports: [ConfigModule],
        providers: [
          PrismaService,
          { provide: CREDENTIAL_REPOSITORY, useValue: inMemoryCredRepo },
          { provide: PROJECT_REPOSITORY, useValue: inMemoryProjRepo },
          { provide: TENANT_REPOSITORY, useValue: inMemoryTenantRepo },
          { provide: QUOTA_REPOSITORY, useValue: inMemoryQuotaRepo },
          { provide: RECEIPT_REPOSITORY, useValue: inMemoryReceiptRepo },
          { provide: ARCHIVE_SEGMENT_REPOSITORY, useValue: inMemoryArchiveRepo },
          { provide: CHECKPOINT_REPOSITORY, useValue: inMemoryCheckpointRepo },
          { provide: InMemoryCredentialRepository, useValue: inMemoryCredRepo },
          { provide: InMemoryProjectRepository, useValue: inMemoryProjRepo },
          { provide: InMemoryTenantRepository, useValue: inMemoryTenantRepo },
          { provide: InMemoryQuotaRepository, useValue: inMemoryQuotaRepo },
          { provide: InMemoryReceiptRepository, useValue: inMemoryReceiptRepo },
          { provide: InMemoryArchiveSegmentRepository, useValue: inMemoryArchiveRepo },
          { provide: InMemoryCheckpointRepository, useValue: inMemoryCheckpointRepo },
        ],
        exports: [
          PrismaService,
          CREDENTIAL_REPOSITORY,
          PROJECT_REPOSITORY,
          TENANT_REPOSITORY,
          QUOTA_REPOSITORY,
          RECEIPT_REPOSITORY,
          ARCHIVE_SEGMENT_REPOSITORY,
          CHECKPOINT_REPOSITORY,
          InMemoryCredentialRepository,
          InMemoryProjectRepository,
          InMemoryTenantRepository,
          InMemoryQuotaRepository,
          InMemoryReceiptRepository,
          InMemoryArchiveSegmentRepository,
          InMemoryCheckpointRepository,
        ],
      };
    }

    return {
      module: MetadataModule,
      imports: [ConfigModule],
      providers: [
        PrismaService,
        InMemoryCredentialRepository,
        InMemoryProjectRepository,
        InMemoryTenantRepository,
        InMemoryQuotaRepository,
        InMemoryReceiptRepository,
        InMemoryArchiveSegmentRepository,
        InMemoryCheckpointRepository,
        PrismaCredentialRepository,
        PrismaProjectRepository,
        PrismaTenantRepository,
        PrismaQuotaRepository,
        PrismaReceiptRepository,
        PrismaArchiveSegmentRepository,
        PrismaCheckpointRepository,
        {
          provide: CREDENTIAL_REPOSITORY,
          useFactory: (config: ConfigService, prisma: PrismaCredentialRepository, inMemory: InMemoryCredentialRepository) => {
            if (config.nodeEnv === 'production') return prisma;
            return config.databaseUrl.includes('REPLACE_ME') ? inMemory : prisma;
          },
          inject: [ConfigService, PrismaCredentialRepository, InMemoryCredentialRepository],
        },
        {
          provide: PROJECT_REPOSITORY,
          useFactory: (config: ConfigService, prisma: PrismaProjectRepository, inMemory: InMemoryProjectRepository) => {
            if (config.nodeEnv === 'production') return prisma;
            return config.databaseUrl.includes('REPLACE_ME') ? inMemory : prisma;
          },
          inject: [ConfigService, PrismaProjectRepository, InMemoryProjectRepository],
        },
        {
          provide: TENANT_REPOSITORY,
          useFactory: (config: ConfigService, prisma: PrismaTenantRepository, inMemory: InMemoryTenantRepository) => {
            if (config.nodeEnv === 'production') return prisma;
            return config.databaseUrl.includes('REPLACE_ME') ? inMemory : prisma;
          },
          inject: [ConfigService, PrismaTenantRepository, InMemoryTenantRepository],
        },
        {
          provide: QUOTA_REPOSITORY,
          useFactory: (config: ConfigService, prisma: PrismaQuotaRepository, inMemory: InMemoryQuotaRepository) => {
            if (config.nodeEnv === 'production') return prisma;
            return config.databaseUrl.includes('REPLACE_ME') ? inMemory : prisma;
          },
          inject: [ConfigService, PrismaQuotaRepository, InMemoryQuotaRepository],
        },
        {
          provide: RECEIPT_REPOSITORY,
          useFactory: (config: ConfigService, prisma: PrismaReceiptRepository, inMemory: InMemoryReceiptRepository) => {
            if (config.nodeEnv === 'production') return prisma;
            return config.databaseUrl.includes('REPLACE_ME') ? inMemory : prisma;
          },
          inject: [ConfigService, PrismaReceiptRepository, InMemoryReceiptRepository],
        },
        {
          provide: ARCHIVE_SEGMENT_REPOSITORY,
          useFactory: (
            config: ConfigService,
            prisma: PrismaArchiveSegmentRepository,
            inMemory: InMemoryArchiveSegmentRepository,
          ) => {
            if (config.nodeEnv === 'production') return prisma;
            return config.databaseUrl.includes('REPLACE_ME') ? inMemory : prisma;
          },
          inject: [ConfigService, PrismaArchiveSegmentRepository, InMemoryArchiveSegmentRepository],
        },
        {
          provide: CHECKPOINT_REPOSITORY,
          useFactory: (config: ConfigService, prisma: PrismaCheckpointRepository, inMemory: InMemoryCheckpointRepository) => {
            if (config.nodeEnv === 'production') return prisma;
            return config.databaseUrl.includes('REPLACE_ME') ? inMemory : prisma;
          },
          inject: [ConfigService, PrismaCheckpointRepository, InMemoryCheckpointRepository],
        },
      ],
      exports: [
        PrismaService,
        CREDENTIAL_REPOSITORY,
        PROJECT_REPOSITORY,
        TENANT_REPOSITORY,
        QUOTA_REPOSITORY,
        RECEIPT_REPOSITORY,
        ARCHIVE_SEGMENT_REPOSITORY,
        CHECKPOINT_REPOSITORY,
        InMemoryCredentialRepository,
        InMemoryProjectRepository,
        InMemoryTenantRepository,
        InMemoryQuotaRepository,
        InMemoryReceiptRepository,
        InMemoryArchiveSegmentRepository,
        InMemoryCheckpointRepository,
      ],
    };
  }
}
