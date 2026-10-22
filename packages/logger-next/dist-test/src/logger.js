import { createSkyraLogger } from '@skyra/logger-node';
import { isServerlessRuntime, isEdgeRuntime } from './internal/runtime.js';
import { getGlobalNextLogger, setGlobalNextLogger } from './internal/singleton.js';
import { getNextRequestContext } from './request-context.js';
import { reportDiagnostic } from './internal/diagnostics.js';
/**
 * Production-grade Next.js Logger wrapping SkyraLogger.
 * Seamlessly enriches log events with active Next.js request correlation context.
 */
export class SkyraNextLogger {
    underlying;
    options;
    constructor(underlying, options) {
        this.underlying = underlying;
        this.options = options;
    }
    getUnderlying() {
        return this.underlying;
    }
    getOptions() {
        return this.options;
    }
    trace(message, metadata) {
        this.log('trace', message, metadata);
    }
    debug(message, metadata) {
        this.log('debug', message, metadata);
    }
    info(message, metadata) {
        this.log('info', message, metadata);
    }
    warn(message, metadata) {
        this.log('warn', message, metadata);
    }
    error(message, metadata, trace) {
        let context = metadata ? { ...metadata } : {};
        if (trace && !context.error) {
            context.error = { stack: trace };
        }
        this.log('error', message, context);
    }
    fatal(message, metadata) {
        this.log('fatal', message, metadata);
    }
    log(level, message, metadata) {
        const enriched = this.enrichWithRequestContext(metadata);
        const msgStr = typeof message === 'string' ? message : String(message ?? '');
        this.underlying.log(level, msgStr, enriched);
    }
    child(childContext) {
        const childUnderlying = this.underlying.child(childContext);
        return new SkyraNextLogger(childUnderlying, this.options);
    }
    async flush() {
        await this.underlying.flush();
    }
    async close() {
        await this.underlying.close();
    }
    getStatus() {
        return this.underlying.getStatus();
    }
    enrichWithRequestContext(metadata) {
        const store = getNextRequestContext();
        if (!store) {
            return metadata ?? {};
        }
        const enriched = {};
        if (store.traceId) {
            enriched.traceId = store.traceId;
        }
        if (store.spanId) {
            enriched.spanId = store.spanId;
        }
        if (store.requestId) {
            enriched.labels = { request_id: store.requestId };
        }
        if (store.customContext && Object.keys(store.customContext).length > 0) {
            Object.assign(enriched, store.customContext);
        }
        if (metadata) {
            Object.assign(enriched, metadata);
        }
        return enriched;
    }
}
/**
 * Creates or reuses a singleton SkyraNextLogger for Next.js application runtimes.
 * Supports development hot-reload reuse and serverless stdout defaults.
 */
export function createNextSkyraLogger(options) {
    // Edge runtime guard
    if (isEdgeRuntime()) {
        reportDiagnostic('EdgeRuntimeNotice', 'Running inside Edge runtime. File transports are disabled.');
    }
    // Hot reload reuse: avoid recreating instance if already initialized with matching project/service
    const existing = getGlobalNextLogger();
    if (existing) {
        const existingOpts = existing.getOptions();
        if (existingOpts.projectId === options.projectId && existingOpts.serviceName === options.serviceName) {
            return existing;
        }
    }
    // Serverless defaults: default transport to stdout unless explicitly configured
    let transport = options.transport;
    if (!transport) {
        if (isServerlessRuntime() || isEdgeRuntime()) {
            transport = { type: 'stdout' };
        }
        else {
            transport = {
                type: 'file',
                directory: './logs',
            };
        }
    }
    const underlying = createSkyraLogger({
        projectId: options.projectId,
        serviceName: options.serviceName,
        environment: options.environment,
        instanceId: options.instanceId,
        serviceVersion: options.serviceVersion,
        level: options.level ?? 'info',
        transport,
        limits: options.limits,
        additionalSensitiveKeys: options.additionalSensitiveKeys,
        clock: options.clock,
        onDrop: options.onDrop,
        onError: options.onError,
    });
    const resolvedOptions = {
        ...options,
        transport,
    };
    const nextLogger = new SkyraNextLogger(underlying, resolvedOptions);
    setGlobalNextLogger(nextLogger);
    return nextLogger;
}
/**
 * Retrieves the registered singleton server logger.
 * If not yet initialized, initializes a sensible fallback instance.
 */
export function getSkyraServerLogger() {
    const existing = getGlobalNextLogger();
    if (existing) {
        return existing;
    }
    // Fallback initialization
    const logDir = process.env.SKYRA_LOG_DIRECTORY || process.env.SKYRA_TEST_LOG_DIR;
    const transport = logDir ? { type: 'file', directory: logDir } : { type: 'stdout' };
    return createNextSkyraLogger({
        projectId: process.env.SKYRA_PROJECT_ID || 'skyra-next',
        serviceName: process.env.SKYRA_SERVICE_NAME || 'nextjs-app',
        environment: (process.env.NODE_ENV || 'development'),
        instanceId: process.env.INSTANCE_ID || `next-${process.pid || 'server'}`,
        level: process.env.LOG_LEVEL || 'info',
        transport,
    });
}
//# sourceMappingURL=logger.js.map