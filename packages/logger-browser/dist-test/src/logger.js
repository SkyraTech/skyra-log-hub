/**
 * @skyra/logger-browser - Main SkyraBrowserLogger Implementation
 */
import { resolveBrowserConfig } from './config.js';
import { BrowserContext } from './context.js';
import { buildBrowserLogEvent } from './event-builder.js';
import { BatchQueue } from './internal/batch-queue.js';
import { MemoryTransport } from './transports/memory.transport.js';
import { ConsoleTransport } from './transports/console.transport.js';
import { HttpTransport } from './transports/http.transport.js';
import { installGlobalErrorCapture } from './capture/global-errors.js';
import { installUnhandledRejectionCapture } from './capture/unhandled-rejections.js';
import { trackBrowserNavigation } from './capture/navigation.js';
import { startBrowserTimer } from './instrumentation/timer.js';
import { installLifecycleHandlers } from './internal/lifecycle.js';
const LEVEL_SEVERITY = {
    trace: 10,
    debug: 20,
    info: 30,
    warn: 40,
    error: 50,
    fatal: 60,
};
export class SkyraBrowserLogger {
    _config;
    _transport;
    _queue;
    _context;
    _currentLevel;
    _isDisposed = false;
    _cleanups = [];
    constructor(config, injectedTransport, injectedQueue, injectedContext) {
        this._config = resolveBrowserConfig(config);
        this._currentLevel = this._config.level;
        this._context = injectedContext ?? new BrowserContext();
        if (injectedTransport) {
            this._transport = injectedTransport;
        }
        else if (typeof this._config.transport === 'object' && 'send' in this._config.transport) {
            this._transport = this._config.transport;
        }
        else {
            const conf = this._config.transport;
            if (conf.type === 'memory') {
                this._transport = new MemoryTransport(conf);
            }
            else if (conf.type === 'http') {
                this._transport = new HttpTransport(conf);
            }
            else {
                this._transport = new ConsoleTransport(conf);
            }
        }
        this._queue = injectedQueue ?? new BatchQueue(this._config, this._transport);
        // Install global capture & lifecycle only if this is the root logger
        if (!injectedQueue) {
            if (this._config.capture.globalErrors) {
                this._cleanups.push(installGlobalErrorCapture(this));
            }
            if (this._config.capture.unhandledRejections) {
                this._cleanups.push(installUnhandledRejectionCapture(this));
            }
            this._cleanups.push(installLifecycleHandlers(this._queue));
        }
    }
    isLevelEnabled(level) {
        if (this._config.disabled || this._isDisposed) {
            return false;
        }
        const currentSev = LEVEL_SEVERITY[this._currentLevel] ?? 30;
        const targetSev = LEVEL_SEVERITY[level] ?? 30;
        return targetSev >= currentSev;
    }
    setLevel(level) {
        if (LEVEL_SEVERITY[level] !== undefined) {
            this._currentLevel = level;
        }
    }
    getLevel() {
        return this._currentLevel;
    }
    getContext() {
        return this._context;
    }
    log(level, message, metadata) {
        if (!this.isLevelEnabled(level)) {
            return false;
        }
        // Extract canonical fields from metadata if present
        const action = typeof metadata?.['action'] === 'string' ? metadata['action'] : undefined;
        const outcome = typeof metadata?.['outcome'] === 'string' ? metadata['outcome'] : undefined;
        const durationNs = typeof metadata?.['durationNs'] === 'number' ? metadata['durationNs'] : undefined;
        const durationMs = typeof metadata?.['durationMs'] === 'number' ? metadata['durationMs'] : undefined;
        const route = typeof metadata?.['route'] === 'string' ? metadata['route'] : undefined;
        const component = typeof metadata?.['component'] === 'string' ? metadata['component'] : this._config.component;
        const http = typeof metadata?.['http'] === 'object' && metadata['http'] !== null
            ? metadata['http']
            : undefined;
        const error = metadata?.['error'];
        // Strip extracted fields from remaining business metadata
        let cleanMetadata;
        if (metadata) {
            const rest = { ...metadata };
            delete rest['action'];
            delete rest['outcome'];
            delete rest['durationNs'];
            delete rest['durationMs'];
            delete rest['route'];
            delete rest['component'];
            delete rest['http'];
            delete rest['error'];
            if (Object.keys(rest).length > 0) {
                cleanMetadata = rest;
            }
        }
        const event = buildBrowserLogEvent(this._config, {
            level,
            message,
            metadata: cleanMetadata,
            context: this._context.get(),
            component,
            action,
            outcome,
            durationNs,
            durationMs,
            route,
            http,
            error,
        });
        return this._queue.enqueue(event);
    }
    trace(message, metadata) {
        return this.log('trace', message, metadata);
    }
    debug(message, metadata) {
        return this.log('debug', message, metadata);
    }
    info(message, metadata) {
        return this.log('info', message, metadata);
    }
    warn(message, metadata) {
        return this.log('warn', message, metadata);
    }
    error(message, metadata) {
        return this.log('error', message, metadata);
    }
    fatal(message, metadata) {
        return this.log('fatal', message, metadata);
    }
    child(childContext) {
        const newContext = new BrowserContext();
        newContext.set({
            ...this._context.get(),
            ...childContext,
        });
        const childConfig = {
            projectId: this._config.projectId,
            serviceName: this._config.serviceName,
            environment: this._config.environment,
            level: this._currentLevel,
            component: childContext.component ?? this._config.component,
            serviceVersion: this._config.serviceVersion,
            includeUserAgent: this._config.includeUserAgent,
            transport: this._transport,
            limits: this._config.limits,
            redaction: this._config.redaction,
            validateEvents: this._config.validateEvents,
            disabled: this._config.disabled,
        };
        return new SkyraBrowserLogger(childConfig, this._transport, this._queue, newContext);
    }
    startTimer(name, options) {
        return startBrowserTimer(this, name, options);
    }
    trackNavigation(payload) {
        trackBrowserNavigation(this, payload);
    }
    async flush() {
        await this._queue.flush();
    }
    async dispose() {
        if (this._isDisposed)
            return;
        this._isDisposed = true;
        // Run cleanups (remove event listeners)
        for (const cleanup of this._cleanups) {
            try {
                cleanup();
            }
            catch {
                // Ignored
            }
        }
        this._cleanups.length = 0;
        await this._queue.dispose();
    }
    getStatus() {
        return this._queue.getStatus();
    }
}
export function createSkyraBrowserLogger(config) {
    return new SkyraBrowserLogger(config);
}
//# sourceMappingURL=logger.js.map