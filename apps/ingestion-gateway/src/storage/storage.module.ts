import { Module, type DynamicModule, Global } from '@nestjs/common';
import { WalJournalService, type WalJournalOptions } from './wal/wal-journal.service.js';
import { ReceiptService } from './receipt/receipt.service.js';
import { DeduplicationLockService } from './receipt/receipt-lock.service.js';
import { ReceiptRetentionService, type RetentionServiceOptions } from './receipt/receipt-retention.service.js';
import { RECEIPT_CACHE, NullReceiptCache, ValkeyReceiptCache, type IReceiptCache } from './receipt/receipt-cache.interface.js';
import { ArchiveWriterService, type ArchiveWriterOptions } from './archive/archive-writer.service.js';
import { MetadataModule } from '../metadata/metadata.module.js';
import { ARCHIVE_SEGMENT_REPOSITORY } from '../metadata/repositories/archive-segment.repository.interface.js';
import { RECEIPT_REPOSITORY } from '../metadata/repositories/receipt.repository.interface.js';

export interface StorageModuleOptions {
  wal?: WalJournalOptions;
  archive?: ArchiveWriterOptions;
  retention?: RetentionServiceOptions;
  cache?: {
    enabled?: boolean;
    defaultTtlSeconds?: number;
    customCache?: IReceiptCache;
  };
}

@Global()
@Module({})
export class StorageModule {
  public static forRoot(options?: StorageModuleOptions): DynamicModule {
    let cacheProvider: any;
    if (options?.cache?.customCache) {
      cacheProvider = {
        provide: RECEIPT_CACHE,
        useValue: options.cache.customCache,
      };
    } else if (options?.cache?.enabled) {
      cacheProvider = {
        provide: RECEIPT_CACHE,
        useFactory: () => new ValkeyReceiptCache(options?.cache?.defaultTtlSeconds),
      };
    } else {
      cacheProvider = {
        provide: RECEIPT_CACHE,
        useClass: NullReceiptCache,
      };
    }

    return {
      module: StorageModule,
      imports: [MetadataModule],
      providers: [
        {
          provide: WalJournalService,
          useFactory: () => new WalJournalService(undefined, options?.wal),
        },
        {
          provide: DeduplicationLockService,
          useFactory: () => new DeduplicationLockService(),
        },
        cacheProvider,
        ReceiptService,
        {
          provide: ReceiptRetentionService,
          useFactory: (receiptRepo) => {
            return new ReceiptRetentionService(receiptRepo, options?.retention);
          },
          inject: [RECEIPT_REPOSITORY],
        },
        {
          provide: ArchiveWriterService,
          useFactory: (archiveRepo) => {
            return new ArchiveWriterService(archiveRepo, options?.archive);
          },
          inject: [ARCHIVE_SEGMENT_REPOSITORY],
        },
      ],
      exports: [
        WalJournalService,
        DeduplicationLockService,
        RECEIPT_CACHE,
        ReceiptService,
        ReceiptRetentionService,
        ArchiveWriterService,
      ],
    };
  }
}
