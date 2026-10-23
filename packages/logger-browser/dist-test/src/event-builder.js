/**
 * @skyra/logger-browser - Canonical Event Builder and Envelope Defense
 */
import { redactSensitiveData } from '@skyra/logger-core/redaction';
import { validateLogEvent } from '@skyra/logger-core/validator';
import { generateBrowserUuid } from './internal/uuid.js';
import { sanitizeMessage, sanitizeMetadata } from './internal/limits.js';
import { isValidTraceId, isValidSpanId } from './internal/correlation.js';
import { emitBrowserDiagnostic } from './internal/diagnostics.js';
export function buildBrowserLogEvent(config, options) {
    const timestamp = new Date().toISOString();
    const eventId = generateBrowserUuid();
    const sanitizedMsg = sanitizeMessage(options.message, config.limits.maxMessageLength);
    // 1. Sanitize raw metadata
    let sanitizedMeta;
    if (options.metadata) {
        sanitizedMeta = sanitizeMetadata(options.metadata, config.limits);
    }
    // 2. Redact sensitive patterns from metadata before canonical assembly
    let redactedMeta;
    if (sanitizedMeta) {
        redactedMeta = redactSensitiveData(sanitizedMeta, config.redaction.maskValue);
    }
    // 3. Assemble canonical structure
    const event = {
        '@timestamp': timestamp,
        'ecs.version': '8.11.0',
        event: {
            id: eventId,
        },
        log: {
            level: options.level,
        },
        message: sanitizedMsg,
        service: {
            name: config.serviceName,
            environment: config.environment,
        },
        skyra: {
            project_id: config.projectId,
            schema_version: '1.0.0',
        },
    };
    if (config.serviceVersion) {
        event['service']['version'] = config.serviceVersion;
    }
    // Event metadata
    const eventObj = event['event'];
    if (options.action) {
        eventObj['action'] = options.action.slice(0, 128);
    }
    if (options.outcome) {
        eventObj['outcome'] = options.outcome;
    }
    if (typeof options.durationNs === 'number' && options.durationNs >= 0) {
        eventObj['duration'] = Math.round(options.durationNs);
    }
    // Skyra metadata
    const skyraObj = event['skyra'];
    const activeComponent = options.component ?? options.context?.component ?? config.component;
    if (activeComponent) {
        skyraObj['component'] = String(activeComponent).slice(0, 64);
    }
    if (typeof options.durationMs === 'number' && options.durationMs >= 0) {
        skyraObj['duration_ms'] = Number(options.durationMs.toFixed(3));
    }
    else if (typeof options.durationNs === 'number' && options.durationNs >= 0) {
        skyraObj['duration_ms'] = Number((options.durationNs / 1_000_000).toFixed(3));
    }
    // Tracing context
    const traceId = options.context?.traceId;
    const spanId = options.context?.spanId;
    if (isValidTraceId(traceId)) {
        event['trace'] = { id: traceId };
    }
    if (isValidSpanId(spanId)) {
        event['span'] = { id: spanId };
    }
    // User-agent if configured
    if (config.includeUserAgent && typeof navigator !== 'undefined' && navigator.userAgent) {
        event['user_agent'] = { original: navigator.userAgent.slice(0, 512) };
    }
    // Route & HTTP metadata
    if (options.http || options.route) {
        const httpObj = {
            ...(options.http ?? {}),
        };
        if (options.route) {
            const cleanRoute = options.route.split('?')[0].split('#')[0];
            httpObj['route'] = cleanRoute.slice(0, 256);
            event['url'] = { path: cleanRoute.slice(0, 1024) };
        }
        event['http'] = httpObj;
    }
    // Error block
    if (options.error) {
        const sanitizeErrorText = (text) => {
            let sanitized = redactSensitiveData(text, config.redaction.maskValue);
            const inlineCredentialPattern = /((?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?token|refresh[_-]?token)\s*=\s*['"]?)[^\s"',;]+/gi;
            sanitized = sanitized.replace(inlineCredentialPattern, `$1${config.redaction.maskValue || '[REDACTED]'}`);
            return sanitized;
        };
        let errToProcess = options.error;
        if (errToProcess instanceof Error) {
            // Redact sensitive values inside error message and stack
            const redactedErrMsg = sanitizeErrorText(errToProcess.message);
            const redactedErrStack = errToProcess.stack
                ? sanitizeErrorText(errToProcess.stack).slice(0, 16384)
                : undefined;
            const ecsErr = {
                type: errToProcess.name || 'Error',
                message: redactedErrMsg || 'Error',
                stack_trace: redactedErrStack,
            };
            event['error'] = ecsErr;
        }
        else if (typeof errToProcess === 'object' && errToProcess !== null) {
            const errDict = redactSensitiveData(errToProcess, config.redaction.maskValue);
            event['error'] = {
                type: typeof errDict['type'] === 'string' ? errDict['type'] : 'CustomError',
                message: typeof errDict['message'] === 'string' ? sanitizeErrorText(errDict['message']) : 'Error',
                stack_trace: typeof errDict['stack_trace'] === 'string' ? sanitizeErrorText(errDict['stack_trace']).slice(0, 16384) : undefined,
            };
        }
        else {
            event['error'] = {
                type: 'Error',
                message: sanitizeErrorText(String(errToProcess)).slice(0, 4096),
            };
        }
    }
    // Labels and Tags
    if (options.context?.labels && Object.keys(options.context.labels).length > 0) {
        const safeLabels = {};
        for (const [k, v] of Object.entries(options.context.labels)) {
            safeLabels[k.slice(0, 64)] = String(v).slice(0, 256);
        }
        event['labels'] = safeLabels;
    }
    if (options.context?.tags && options.context.tags.length > 0) {
        event['tags'] = options.context.tags.slice(0, 20).map((t) => String(t).slice(0, 64));
    }
    // Extra business metadata in skyra.business
    if (redactedMeta && Object.keys(redactedMeta).length > 0) {
        // Check if error was inside metadata
        if (!event['error'] && redactedMeta['error']) {
            const metaErr = redactedMeta['error'];
            if (typeof metaErr === 'object' && metaErr !== null) {
                const errObj = metaErr;
                if (typeof errObj['message'] === 'string') {
                    event['error'] = {
                        type: typeof errObj['type'] === 'string' ? errObj['type'] : 'Error',
                        message: errObj['message'],
                        stack_trace: typeof errObj['stack_trace'] === 'string' ? errObj['stack_trace'] : undefined,
                    };
                }
            }
            delete redactedMeta['error'];
        }
        if (Object.keys(redactedMeta).length > 0) {
            skyraObj['business'] = redactedMeta;
        }
    }
    // Post-Redaction Envelope Defense: Guarantee canonical fields cannot be overridden
    event['@timestamp'] = timestamp;
    event['ecs.version'] = '8.11.0';
    event['skyra']['project_id'] = config.projectId;
    event['skyra']['schema_version'] = '1.0';
    event['event']['id'] = eventId;
    event['log']['level'] = options.level;
    event['message'] = sanitizedMsg;
    event['service']['name'] = config.serviceName;
    event['service']['environment'] = config.environment;
    const finalEvent = event;
    // Schema Validation check
    if (config.validateEvents) {
        const valResult = validateLogEvent(finalEvent);
        if (!valResult.valid) {
            emitBrowserDiagnostic('SchemaValidationError', `Event ${eventId} failed schema validation: ${valResult.errors?.map((e) => `${e.path} ${e.message}`).join(', ')}`);
        }
    }
    return finalEvent;
}
//# sourceMappingURL=event-builder.js.map