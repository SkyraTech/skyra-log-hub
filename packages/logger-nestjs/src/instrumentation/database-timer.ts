import type { SkyraLogger } from '@skyra/logger-node';

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
  /** Database engine system */
  system: DatabaseSystem;
  /** Database name / catalog */
  name?: string;
  /** SQL or database operation (e.g. 'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'FIND') */
  operation: string;
  /** Target table or collection name */
  table?: string;
  /** Alias for table */
  collection?: string;
  /** Sanitized SQL statement template or query pattern (strictly no raw parameter values) */
  statementSanitized?: string;
  /** Query fingerprint hash or template pattern */
  queryFingerprint?: string;
  /** Number of rows or records affected, if known */
  rowsAffected?: number;
  /** Additional safe metadata (no secrets) */
  metadata?: Record<string, unknown>;
}

/**
 * Reusable helper for measuring execution duration of database queries and operations.
 * Enforces canonical schema constraints without logging raw query parameters or credentials.
 *
 * @param logger The underlying SkyraLogger instance
 * @param options Database operation metadata
 * @param fn The asynchronous database operation to execute and measure
 * @returns The return value of `fn`
 */
export async function measureDatabase<T>(
  logger: SkyraLogger,
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
