import type { SkyraNextLogger } from './logger.js';
export type DatabaseSystem = 'postgresql' | 'mysql' | 'sqlite' | 'duckdb' | 'valkey' | 'redis' | 'elasticsearch' | 'mongodb' | 'oracle' | 'sqlserver';
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
export declare function measureDatabase<T>(logger: SkyraNextLogger, options: DatabaseTimerOptions, fn: () => Promise<T>): Promise<T>;
/**
 * Reusable helper for measuring execution duration of asynchronous business operations in Next.js.
 */
export declare function measureOperation<T>(logger: SkyraNextLogger, name: string, fn: () => Promise<T>, metadata?: Record<string, unknown>): Promise<T>;
/**
 * Reusable helper for measuring execution duration of background jobs.
 */
export declare function measureJob<T>(logger: SkyraNextLogger, name: string, fn: () => Promise<T>, options?: JobTimerOptions): Promise<T>;
//# sourceMappingURL=timing.d.ts.map