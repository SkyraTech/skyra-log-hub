import * as crypto from 'node:crypto';
import * as os from 'node:os';
import type {
  SkyraLogEvent,
  LogLevel,
  CanonicalEnvironment,
  EcsEvent,
  EcsService,
  SkyraMetadata,
  EcsError,
} from '@skyra/logger-core';
import {
  normalizeEnvironment,
  normalizeEventAction,
  redactSensitiveData,
} from '@skyra/logger-core';
import type { ResolvedSkyraLoggerConfig } from './config.js';
import { sanitizeMetadata, sanitizeMessage } from './internal/limits.js';

export interface LogContext {
  component?: string;
  traceId?: string;
  spanId?: string;
  action?: string;
  outcome?: 'success' | 'failure' | 'unknown';
  category?: string[];
  durationMs?: number;
  durationNs?: number;
  error?: unknown;
  labels?: Record<string, string>;
  tags?: string[];
  http?: Record<string, unknown>;
  database?: Record<string, unknown>;
  job?: Record<string, unknown>;
  user?: Record<string, unknown>;
  client?: Record<string, unknown>;
  url?: Record<string, unknown>;
  audit?: Record<string, unknown>;
  security?: Record<string, unknown>;
  [key: string]: unknown;
}

const CACHED_HOSTNAME = os.hostname();

/**
 * Builds a schema-valid Canonical Skyra Log Event adhering to ECS 8.11.0 and Skyra LogHub v1.
 */
export function buildCanonicalLogEvent(
  config: ResolvedSkyraLoggerConfig,
  level: LogLevel,
  rawMessage: unknown,
  metadata?: LogContext,
  parentContext?: LogContext
): SkyraLogEvent {
  // 1. UTC Timestamp & UUIDv4 Generation
  const now = config.clock();
  const timestamp = now.toISOString(); // Always strict ISO 8601 UTC with trailing 'Z'
  const eventId = crypto.randomUUID();

  // 2. Sanitize and bound top-level message
  const message = sanitizeMessage(rawMessage, config.limits.maxMessageLength);

  // 3. Merge contexts (parent child context + call-site metadata)
  const merged: LogContext = {};
  if (parentContext) {
    Object.assign(merged, parentContext);
  }
  if (metadata) {
    Object.assign(merged, metadata);
  }

  // 4. Sanitize context objects against limits (depth, array length, object entries, circular refs)
  const sanitized = sanitizeMetadata(merged, config.limits) as Record<string, unknown>;

  // 5. ECS event section
  const eventAction = sanitized['action']
    ? normalizeEventAction(String(sanitized['action']))
    : undefined;

  const eventSection: EcsEvent = {
    id: eventId,
  };
  if (eventAction) eventSection.action = eventAction;
  if (sanitized['outcome']) eventSection.outcome = sanitized['outcome'] as 'success' | 'failure' | 'unknown';
  if (Array.isArray(sanitized['category'])) {
    eventSection.category = sanitized['category'].map(String);
  }

  // Handle duration conversion (nanoseconds in ECS, milliseconds in skyra)
  let durationNs: number | undefined;
  let durationMs: number | undefined;

  if (typeof sanitized['durationMs'] === 'number' && Number.isFinite(sanitized['durationMs'])) {
    durationMs = sanitized['durationMs'];
    durationNs = Math.round(durationMs * 1_000_000);
  } else if (typeof sanitized['durationNs'] === 'number' && Number.isFinite(sanitized['durationNs'])) {
    durationNs = sanitized['durationNs'];
    durationMs = Number((durationNs / 1_000_000).toFixed(3));
  } else if (typeof sanitized['duration'] === 'number' && Number.isFinite(sanitized['duration'])) {
    // If passed as 'duration', treat as nanoseconds if >= 100_000, else milliseconds
    if (sanitized['duration'] > 100_000) {
      durationNs = sanitized['duration'];
      durationMs = Number((durationNs / 1_000_000).toFixed(3));
    } else {
      durationMs = sanitized['duration'];
      durationNs = Math.round(durationMs * 1_000_000);
    }
  }

  if (durationNs !== undefined && durationNs >= 0) {
    eventSection.duration = durationNs;
  }

  // 6. Service section
  const serviceSection: EcsService = {
    name: config.serviceName,
    environment: normalizeEnvironment(config.environment),
  };
  if (config.serviceVersion) {
    serviceSection.version = config.serviceVersion;
  }
  const nodeName = config.nodeName ?? config.instanceId;
  if (nodeName) {
    serviceSection.node = { name: nodeName };
  }

  // 7. Skyra metadata section
  const skyraSection: SkyraMetadata = {
    project_id: config.projectId,
    schema_version: '1.0',
  };
  if (sanitized['component']) {
    skyraSection.component = String(sanitized['component']);
  }
  if (durationMs !== undefined && durationMs >= 0) {
    skyraSection.duration_ms = durationMs;
  }

  // 8. Error handling
  let errorSection: EcsError | undefined;
  const rawError = sanitized['error'];
  if (rawError && typeof rawError === 'object') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const errObj = rawError as any;
    errorSection = {
      type: errObj.name || errObj.type || 'Error',
      message: errObj.message ? String(errObj.message) : 'An error occurred',
    };
    if (errObj.code !== undefined) {
      errorSection.code = errObj.code;
    }
    if (errObj.stack_trace) {
      errorSection.stack_trace = String(errObj.stack_trace);
    } else if (errObj.stack) {
      errorSection.stack_trace = String(errObj.stack);
    }
  }

  // 9. Assembling the complete event
  const canonicalEvent: SkyraLogEvent = {
    '@timestamp': timestamp,
    'ecs.version': '8.11.0',
    event: eventSection,
    log: { level },
    message,
    service: serviceSection,
    skyra: skyraSection,
    host: {
      hostname: CACHED_HOSTNAME,
      name: CACHED_HOSTNAME,
    },
  };

  // 10. Optional Tracing
  const traceId = sanitized['traceId'] || sanitized['trace_id'] || (sanitized['trace'] as any)?.id;
  if (typeof traceId === 'string' && traceId.length > 0) {
    canonicalEvent.trace = { id: traceId };
  }
  const spanId = sanitized['spanId'] || sanitized['span_id'] || (sanitized['span'] as any)?.id;
  if (typeof spanId === 'string' && spanId.length > 0) {
    canonicalEvent.span = { id: spanId };
  }

  // 11. Optional Subsections (HTTP, DB, Job, User, Client, Url, Labels, Tags)
  if (sanitized['http'] && typeof sanitized['http'] === 'object') {
    canonicalEvent.http = sanitized['http'] as any;
  }
  if (sanitized['database'] && typeof sanitized['database'] === 'object') {
    canonicalEvent.database = sanitized['database'] as any;
  }
  if (sanitized['job'] && typeof sanitized['job'] === 'object') {
    canonicalEvent.job = sanitized['job'] as any;
  }
  if (sanitized['user'] && typeof sanitized['user'] === 'object') {
    canonicalEvent.user = sanitized['user'] as any;
  }
  if (sanitized['client'] && typeof sanitized['client'] === 'object') {
    canonicalEvent.client = sanitized['client'] as any;
  }
  if (sanitized['url'] && typeof sanitized['url'] === 'object') {
    canonicalEvent.url = sanitized['url'] as any;
  }
  if (errorSection) {
    canonicalEvent.error = errorSection;
  }
  if (sanitized['labels'] && typeof sanitized['labels'] === 'object' && !Array.isArray(sanitized['labels'])) {
    canonicalEvent.labels = sanitized['labels'] as Record<string, string>;
  }
  if (Array.isArray(sanitized['tags'])) {
    canonicalEvent.tags = sanitized['tags'].map(String);
  }

  // 12. Business custom metadata
  // Extract custom unmapped fields into skyra.business
  const knownKeys = new Set([
    'component', 'traceId', 'trace_id', 'trace', 'spanId', 'span_id', 'span',
    'action', 'outcome', 'category', 'duration', 'durationMs', 'durationNs',
    'error', 'labels', 'tags', 'http', 'database', 'job', 'user', 'client', 'url',
    'audit', 'security',
  ]);

  const customFields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(sanitized)) {
    if (!knownKeys.has(key)) {
      customFields[key] = value;
    }
  }

  if (sanitized['audit'] && typeof sanitized['audit'] === 'object') {
    skyraSection.audit = sanitized['audit'] as any;
  }
  if (sanitized['security'] && typeof sanitized['security'] === 'object') {
    skyraSection.security = sanitized['security'] as any;
  }
  if (Object.keys(customFields).length > 0) {
    skyraSection.business = customFields;
  }

  // 13. Deep Sensitive Data Redaction
  // Redact all sensitive fields and token patterns before serialization
  const redactedEvent = redactSensitiveData(canonicalEvent) as SkyraLogEvent;

  // Invariant: Mandatory canonical envelope fields must never be corrupted by pattern matching
  redactedEvent.event.id = eventId;
  redactedEvent['@timestamp'] = timestamp;
  redactedEvent['ecs.version'] = '8.11.0';
  redactedEvent.skyra.project_id = config.projectId;
  redactedEvent.skyra.schema_version = '1.0';

  // If user configured additional sensitive keys, check and scrub them
  if (config.additionalSensitiveKeys.length > 0) {
    scrubAdditionalKeys(redactedEvent, new Set(config.additionalSensitiveKeys.map((k) => k.toLowerCase())));
  }

  return redactedEvent as SkyraLogEvent;
}

function scrubAdditionalKeys(target: unknown, sensitiveKeys: Set<string>, visited = new WeakSet<object>()): void {
  if (!target || typeof target !== 'object') return;
  if (visited.has(target)) return;
  visited.add(target);

  if (Array.isArray(target)) {
    for (const item of target) {
      scrubAdditionalKeys(item, sensitiveKeys, visited);
    }
    return;
  }

  const record = target as Record<string, unknown>;
  for (const [k, v] of Object.entries(record)) {
    const cleanKey = k.toLowerCase().replace(/[-_.]/g, '');
    if (sensitiveKeys.has(k.toLowerCase()) || sensitiveKeys.has(cleanKey)) {
      record[k] = '[REDACTED]';
    } else {
      scrubAdditionalKeys(v, sensitiveKeys, visited);
    }
  }
}
