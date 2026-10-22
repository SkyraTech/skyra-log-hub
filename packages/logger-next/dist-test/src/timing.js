const VALID_DATABASE_SYSTEMS = new Set([
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
/**
 * Reusable helper for measuring execution duration of database operations in Next.js server code.
 * Enforces canonical schema constraints without logging raw query parameters or credentials.
 */
export async function measureDatabase(logger, options, fn) {
    const startNs = process.hrtime.bigint();
    const normalizedSystem = String(options.system).toLowerCase();
    const validSystem = VALID_DATABASE_SYSTEMS.has(normalizedSystem)
        ? normalizedSystem
        : 'postgresql';
    const tableName = (options.table || options.collection)?.slice(0, 128);
    const operation = options.operation.toUpperCase().slice(0, 32);
    const dbSection = {
        system: validSystem,
        operation,
    };
    if (options.name)
        dbSection['name'] = String(options.name).slice(0, 128);
    if (tableName)
        dbSection['table'] = tableName;
    if (options.statementSanitized) {
        dbSection['statement_sanitized'] = String(options.statementSanitized).slice(0, 4096);
    }
    if (options.rowsAffected !== undefined && options.rowsAffected >= 0) {
        dbSection['rows_affected'] = Math.floor(options.rowsAffected);
    }
    const skyraDbSection = {};
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
    }
    catch (error) {
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
export async function measureOperation(logger, name, fn, metadata) {
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
    }
    catch (error) {
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
export async function measureJob(logger, name, fn, options) {
    const startNs = process.hrtime.bigint();
    const jobSection = {
        type: name.slice(0, 64),
    };
    if (options?.id)
        jobSection['id'] = String(options.id).slice(0, 128);
    if (options?.attempt !== undefined && options.attempt >= 1) {
        jobSection['attempt'] = Math.floor(options.attempt);
    }
    if (options?.queueDurationMs !== undefined && options.queueDurationMs >= 0) {
        jobSection['queue_duration_ms'] = options.queueDurationMs;
    }
    const customMetadata = {};
    if (options?.queue)
        customMetadata['queue'] = options.queue;
    if (options?.maxAttempts)
        customMetadata['max_attempts'] = options.maxAttempts;
    if (options?.metadata)
        Object.assign(customMetadata, options.metadata);
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
    }
    catch (error) {
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
//# sourceMappingURL=timing.js.map