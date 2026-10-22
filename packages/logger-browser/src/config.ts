/**
 * @skyra/logger-browser - Configuration Resolver and Validator
 */

import { normalizeEnvironment } from '@skyra/logger-core/types';
import type {
  LogLevel,
  SkyraBrowserLoggerConfig,
  BrowserTransportConfig,
  BrowserTransport,
  BrowserCaptureConfig,
  BrowserLimitsConfig,
  BrowserRedactionConfig,
} from './types.js';

export interface ResolvedBrowserLimits {
  readonly maxMessageLength: number;
  readonly maxEventSizeBytes: number;
  readonly maxMetadataDepth: number;
  readonly maxObjectKeys: number;
  readonly maxArrayLength: number;
  readonly maxQueueEvents: number;
  readonly maxQueueBytes: number;
}

export interface ResolvedBrowserConfig {
  readonly projectId: string;
  readonly serviceName: string;
  readonly environment: string;
  readonly level: LogLevel;
  readonly serviceVersion?: string;
  readonly component?: string;
  readonly includeUserAgent: boolean;
  readonly transport: BrowserTransportConfig | BrowserTransport;
  readonly capture: Required<BrowserCaptureConfig>;
  readonly limits: ResolvedBrowserLimits;
  readonly redaction: BrowserRedactionConfig;
  readonly immediateFlushLevels: ReadonlySet<LogLevel>;
  readonly disabled: boolean;
  readonly validateEvents: boolean;
}

const DEFAULT_LIMITS: ResolvedBrowserLimits = {
  maxMessageLength: 8192,
  maxEventSizeBytes: 256 * 1024, // 256 KiB
  maxMetadataDepth: 8,
  maxObjectKeys: 100,
  maxArrayLength: 100,
  maxQueueEvents: 1000,
  maxQueueBytes: 4 * 1024 * 1024, // 4 MiB
};

const VALID_LEVELS: ReadonlySet<LogLevel> = new Set([
  'trace',
  'debug',
  'info',
  'warn',
  'error',
  'fatal',
]);

const PROJECT_ID_REGEX = /^[a-z0-9-]+$/;
const SERVICE_NAME_REGEX = /^[a-z0-9-]+$/;

export function resolveBrowserConfig(
  raw: SkyraBrowserLoggerConfig
): ResolvedBrowserConfig {
  if (!raw || typeof raw !== 'object') {
    throw new TypeError('SkyraBrowserLoggerConfig must be a non-null object.');
  }

  const projectId = String(raw.projectId ?? '').trim();
  if (!projectId || !PROJECT_ID_REGEX.test(projectId) || projectId.length < 2 || projectId.length > 64) {
    throw new Error(
      `Invalid projectId: "${raw.projectId}". Must match ^[a-z0-9-]+$ and be 2-64 characters.`
    );
  }

  const serviceName = String(raw.serviceName ?? '').trim();
  if (!serviceName || !SERVICE_NAME_REGEX.test(serviceName) || serviceName.length < 2 || serviceName.length > 64) {
    throw new Error(
      `Invalid serviceName: "${raw.serviceName}". Must match ^[a-z0-9-]+$ and be 2-64 characters.`
    );
  }

  const rawEnv = String(raw.environment ?? '').trim();
  if (!rawEnv) {
    throw new Error('environment is required.');
  }
  const environment = normalizeEnvironment(rawEnv);

  const level = (raw.level ?? 'info').toLowerCase() as LogLevel;
  if (!VALID_LEVELS.has(level)) {
    throw new Error(
      `Invalid log level: "${raw.level}". Allowed: ${Array.from(VALID_LEVELS).join(', ')}.`
    );
  }

  // Determine default transport
  let transport: BrowserTransportConfig | BrowserTransport = raw.transport ?? { type: 'console' };

  const capture: Required<BrowserCaptureConfig> = {
    globalErrors: Boolean(raw.capture?.globalErrors ?? false),
    unhandledRejections: Boolean(raw.capture?.unhandledRejections ?? false),
    navigation: Boolean(raw.capture?.navigation ?? false),
  };

  const limits: ResolvedBrowserLimits = {
    maxMessageLength: Math.max(
      16,
      raw.limits?.maxMessageLength ?? DEFAULT_LIMITS.maxMessageLength
    ),
    maxEventSizeBytes: Math.max(
      256,
      raw.limits?.maxEventSizeBytes ?? DEFAULT_LIMITS.maxEventSizeBytes
    ),
    maxMetadataDepth: Math.max(
      1,
      raw.limits?.maxMetadataDepth ?? DEFAULT_LIMITS.maxMetadataDepth
    ),
    maxObjectKeys: Math.max(
      1,
      raw.limits?.maxObjectKeys ?? DEFAULT_LIMITS.maxObjectKeys
    ),
    maxArrayLength: Math.max(
      1,
      raw.limits?.maxArrayLength ?? DEFAULT_LIMITS.maxArrayLength
    ),
    maxQueueEvents: Math.max(
      1,
      raw.limits?.maxQueueEvents ?? DEFAULT_LIMITS.maxQueueEvents
    ),
    maxQueueBytes: Math.max(
      1024,
      raw.limits?.maxQueueBytes ?? DEFAULT_LIMITS.maxQueueBytes
    ),
  };

  const immediateFlushLevels = new Set<LogLevel>(
    raw.immediateFlushLevels ?? ['error', 'fatal']
  );

  return {
    projectId,
    serviceName,
    environment,
    level,
    serviceVersion: raw.serviceVersion ? String(raw.serviceVersion).slice(0, 64) : undefined,
    component: raw.component ? String(raw.component).slice(0, 64) : undefined,
    includeUserAgent: Boolean(raw.includeUserAgent ?? false),
    transport,
    capture,
    limits,
    redaction: raw.redaction ?? {},
    immediateFlushLevels,
    disabled: Boolean(raw.disabled ?? false),
    validateEvents: raw.validateEvents !== false,
  };
}
