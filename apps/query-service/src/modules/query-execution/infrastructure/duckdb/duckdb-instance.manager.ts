import { Injectable, type OnModuleInit, type OnModuleDestroy, Logger } from '@nestjs/common';
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';
import { QueryConfigService } from '../../../../config/query-config.service.js';
import { DuckDbUnavailableException } from '../../../../common/errors/query.errors.js';

@Injectable()
export class DuckDbInstanceManager implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DuckDbInstanceManager.name);
  private instance?: DuckDBInstance;
  private primaryConnection?: DuckDBConnection;
  private isInitialized = false;

  constructor(private readonly config: QueryConfigService) {}

  public async onModuleInit(): Promise<void> {
    await this.initialize();
  }

  public async onModuleDestroy(): Promise<void> {
    await this.shutdown();
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized && this.instance) {
      return;
    }
    try {
      this.logger.log(
        `Initializing in-memory DuckDB instance (memory: ${this.config.duckDbMaxMemoryMb}MB, threads: ${this.config.duckDbThreads})`,
      );
      this.instance = await DuckDBInstance.create(':memory:', {
        autoinstall_known_extensions: 'false',
        autoload_known_extensions: 'false',
        max_memory: `${this.config.duckDbMaxMemoryMb}MB`,
        threads: `${this.config.duckDbThreads}`,
      });
      this.primaryConnection = await this.instance.connect();
      this.isInitialized = true;
      this.logger.log('DuckDB analytical execution engine successfully initialized.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to initialize DuckDB instance: ${msg}`);
      throw new DuckDbUnavailableException(`Failed to initialize DuckDB analytical engine: ${msg}`);
    }
  }

  public async createConnection(): Promise<DuckDBConnection> {
    if (!this.instance) {
      await this.initialize();
    }
    if (!this.instance) {
      throw new DuckDbUnavailableException('DuckDB instance is not initialized.');
    }
    return await this.instance.connect();
  }

  public async shutdown(): Promise<void> {
    try {
      if (this.primaryConnection) {
        this.primaryConnection.closeSync();
        this.primaryConnection = undefined;
      }
      if (this.instance) {
        this.instance.closeSync();
        this.instance = undefined;
      }
      this.isInitialized = false;
      this.logger.log('DuckDB analytical engine safely shut down.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Error during DuckDB shutdown: ${msg}`);
    }
  }

  public isReady(): boolean {
    return this.isInitialized && !!this.instance;
  }
}
