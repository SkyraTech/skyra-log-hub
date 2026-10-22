import type { SkyraNextLogger } from './logger.js';
import type { LogContext } from '@skyra/logger-node';

export type DatabaseSystem =
  | 'postgresql'
  | 'mysql'
  | 'sqlite'
  | 'duckdb'
  | 'valkey'
  | 'redis'
  | 'elasticsearch'
  | 'mongodb'
  | 'oracle'
  | 'sqlserver';

const VALID_DATABASE_SYSTEMS = new Set<string>([
  'postgresql',
  'mysql',
  'sqlite',
  'duckdb',
  'valkey',
  'redis',
  'elasticsearch',
  'mongodb',
  'oracle',
  'sqlserver',
]);

export interface DatabaseTimerOptions {
  /** Database engine system (e.g. 'postgresql', 'mysql', 'sqlite', 'redis') */
  system: DatabaseSystem;
  /** Database name / catalog */
  name?: string;
  /** Database operation (e.g. 'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'FIND') */
  operation: string;
  /** Target table or collection name */
  table?: string;
  /** Alias for table */
  collection?: string;
  /** Sanitized SQL statement template (strictly no raw parameter values) */
  statementSanitized?: string;
  /** Normalized query pattern hash or fingerprint */
  queryFingerprint?: string;
  /** Number of rows or records affected, if known */
  rowsAffected?: number;
  /** Additional safe metadata */
  metadata?: Record<string, unknown>;
}

export interface JobTimerOptions {
  id?: string;
  queue?: string;
  attempt?: number;
  maxAttempts?: number;
  queueDurationMs?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Reusable helper for measuring execution duration of database operations in Next.js server code.
 * Enforces canonical schema constraints without logging raw query parameters or credentials.
 */
export async function measureDatabase<T>(
  logger: SkyraNextLogger,
  options: DatabaseTimerOptions,
  fn: () => Promise<T>
): Promise<T> {
  const startNs = process.hrtime.bigint();

  const normalizedSystem = String(options.system).toLowerCase();
  const validSystem = VALID_DATABASE_SYSTEMS.has(normalizedSystem)
    ? (normalizedSystem as DatabaseSystem)
    : 'postgresql';

  const tableName = (options.table || options.collection)?.slice(0, 128);
  const operation = options.operation.toUpperCase().slice(0, 32);

  const dbSection: Record<string, unknown> = {
    system: validSystem,
    operation,
  };
  if (options.name) dbSection['name'] = String(options.name).slice(0, 128);
  if (tableName) dbSection['table'] = tableName;
  if (options.statementSanitized) {
    dbSection['statement_sanitized'] = String(options.statementSanitized).slice(0, 4096);
  }
  if (options.rowsAffected !== undefined && options.rowsAffected >= 0) {
    dbSection['rows_affected'] = Math.floor(options.rowsAffected);
  }

  const skyraDbSection: Record<string, unknown> = {};
  if (options.queryFingerprint) {
    skyraDbSection['query_fingerprint'] = String(options.queryFingerprint).slice(0, 1024);
  }

  try {
    const result = await fn();
    const elapsedNs = Number(process.hrtime.bigint() - startNs);
    const elapsedMs = Number((elapsedNs / 1_000_000).toFixed(3));

    skyraDbSection['client_duration_ms'] = elapsedMs;

    logger.debug(`Database ${operation} completed${tableName ? ` on ${tableName}` : ''}`, {
      action: 'database.query.completed',
      outcome: 'success',
      category: ['database'],
      durationMs: elapsedMs,
      durationNs: elapsedNs,
      database: dbSection,
      skyra: {
        db: skyraDbSection,
      },
      ...(options.metadata ? options.metadata : {}),
    });

    return result;
  } catch (error) {
    const elapsedNs = Number(process.hrtime.bigint() - startNs);
    const elapsedMs = Number((elapsedNs / 1_000_000).toFixed(3));

    skyraDbSection['client_duration_ms'] = elapsedMs;

    logger.error(`Database ${operation} failed${tableName ? ` on ${tableName}` : ''}`, {
      action: 'database.query.failed',
      outcome: 'failure',
      category: ['database'],
      durationMs: elapsedMs,
      durationNs: elapsedNs,
      database: dbSection,
      skyra: {
        db: skyraDbSection,
      },
      error,
      ...(options.metadata ? options.metadata : {}),
    });

    throw error;
  }
}

/**
 * Reusable helper for measuring execution duration of asynchronous business operations in Next.js.
 */
export async function measureOperation<T>(
  logger: SkyraNextLogger,
  name: string,
  fn: () => Promise<T>,
  metadata?: Record<string, unknown>
): Promise<T> {
  const startNs = process.hrtime.bigint();

  try {
    const result = await fn();
    const elapsedNs = Number(process.hrtime.bigint() - startNs);
    const elapsedMs = Number((elapsedNs / 1_000_000).toFixed(3));

    logger.info(`Operation ${name} completed - ${elapsedMs}ms`, {
      action: 'operation.completed',
      outcome: 'success',
      category: ['process'],
      durationMs: elapsedMs,
      durationNs: elapsedNs,
      operation_name: name,
      operation_status: 'completed',
      ...(metadata ? metadata : {}),
    });

    return result;
  } catch (error) {
    const elapsedNs = Number(process.hrtime.bigint() - startNs);
    const elapsedMs = Number((elapsedNs / 1_000_000).toFixed(3));

    logger.error(`Operation ${name} failed - ${elapsedMs}ms`, {
      action: 'operation.failed',
      outcome: 'failure',
      category: ['process'],
      durationMs: elapsedMs,
      durationNs: elapsedNs,
      operation_name: name,
      operation_status: 'failed',
      error,
      ...(metadata ? metadata : {}),
    });

    throw error;
  }
}

/**
 * Reusable helper for measuring execution duration of background jobs.
 */
export async function measureJob<T>(
  logger: SkyraNextLogger,
  name: string,
  fn: () => Promise<T>,
  options?: JobTimerOptions
): Promise<T> {
  const startNs = process.hrtime.bigint();

  const jobSection: Record<string, unknown> = {
    type: name.slice(0, 64),
  };
  if (options?.id) jobSection['id'] = String(options.id).slice(0, 128);
  if (options?.attempt !== undefined && options.attempt >= 1) {
    jobSection['attempt'] = Math.floor(options.attempt);
  }
  if (options?.queueDurationMs !== undefined && options.queueDurationMs >= 0) {
    jobSection['queue_duration_ms'] = options.queueDurationMs;
  }

  const customMetadata: Record<string, unknown> = {};
  if (options?.queue) customMetadata['queue'] = options.queue;
  if (options?.maxAttempts) customMetadata['max_attempts'] = options.maxAttempts;
  if (options?.metadata) Object.assign(customMetadata, options.metadata);

  try {
    const result = await fn();
    const elapsedNs = Number(process.hrtime.bigint() - startNs);
    const elapsedMs = Number((elapsedNs / 1_000_000).toFixed(3));

    jobSection['status'] = 'completed';

    logger.info(`Job ${name} completed - ${elapsedMs}ms`, {
      action: 'job.execution.completed',
      outcome: 'success',
      category: ['job'],
      durationMs: elapsedMs,
      durationNs: elapsedNs,
      skyra: {
        job: jobSection,
        business: Object.keys(customMetadata).length > 0 ? customMetadata : undefined,
      },
    });

    return result;
  } catch (error) {
    const elapsedNs = Number(process.hrtime.bigint() - startNs);
    const elapsedMs = Number((elapsedNs / 1_000_000).toFixed(3));

    jobSection['status'] = 'failed';

    logger.error(`Job ${name} failed - ${elapsedMs}ms`, {
      action: 'job.execution.failed',
      outcome: 'failure',
      category: ['job'],
      durationMs: elapsedMs,
      durationNs: elapsedNs,
      skyra: {
        job: jobSection,
        business: Object.keys(customMetadata).length > 0 ? customMetadata : undefined,
      },
      error,
    });

    throw error;
  }
}
