import { Module, type DynamicModule } from '@nestjs/common';
import { ARCHIVE_SEGMENT_REPOSITORY } from './domain/archive-segment.repository.interface.js';
import { PathSafetyService } from './infrastructure/path-safety.service.js';
import { ManifestVerifierService } from './application/manifest-verifier.service.js';
import { ArchiveDiscoveryService } from './application/archive-discovery.service.js';
import { InMemoryArchiveSegmentRepository } from './infrastructure/in-memory-archive-segment.repository.js';
import { PrismaArchiveSegmentRepository } from './infrastructure/prisma-archive-segment.repository.js';
import { ArchiveDiscoveryController } from './api/archive-discovery.controller.js';
import { QueryConfigService } from '../../config/query-config.service.js';

export interface ArchiveDiscoveryModuleOptions {
  useInMemoryRepo?: boolean;
}

@Module({
  controllers: [ArchiveDiscoveryController],
  providers: [
    PathSafetyService,
    ManifestVerifierService,
    ArchiveDiscoveryService,
    InMemoryArchiveSegmentRepository,
    PrismaArchiveSegmentRepository,
    {
      provide: ARCHIVE_SEGMENT_REPOSITORY,
      useFactory: (
        config: QueryConfigService,
        prismaRepo: PrismaArchiveSegmentRepository,
        inMemoryRepo: InMemoryArchiveSegmentRepository,
      ) => {
        if (config.databaseUrl.includes('REPLACE_ME') || config.nodeEnv === 'test') {
          return inMemoryRepo;
        }
        return prismaRepo;
      },
      inject: [QueryConfigService, PrismaArchiveSegmentRepository, InMemoryArchiveSegmentRepository],
    },
  ],
  exports: [
    ArchiveDiscoveryService,
    PathSafetyService,
    ManifestVerifierService,
    ARCHIVE_SEGMENT_REPOSITORY,
    InMemoryArchiveSegmentRepository,
    PrismaArchiveSegmentRepository,
  ],
})
export class ArchiveDiscoveryModule {
  public static forTest(options?: { useInMemory?: boolean }): DynamicModule {
    return {
      module: ArchiveDiscoveryModule,
      providers: [
        {
          provide: ARCHIVE_SEGMENT_REPOSITORY,
          useClass: options?.useInMemory ? InMemoryArchiveSegmentRepository : PrismaArchiveSegmentRepository,
        },
      ],
    };
  }
}
