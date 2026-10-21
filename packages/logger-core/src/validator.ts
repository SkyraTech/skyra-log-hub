import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import type { ValidateFunction, ErrorObject } from 'ajv';

import { LOG_EVENT_SCHEMA_V1 } from './schema.js';
import type { ValidationResult, ValidationErrorDetail } from './types.js';
import { normalizeEnvironment, normalizeEventAction } from './types.js';

// Initialize and configure Ajv Draft 2020 instance once (cached validator)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ajv = new (Ajv2020 as any)({
  allErrors: true,
  strict: false,
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(addFormats as any)(ajv);

const compiledValidator: ValidateFunction = ajv.compile(LOG_EVENT_SCHEMA_V1);

/**
 * Verifies real calendar validity for RFC3339 UTC timestamps.
 * Validates days in months, leap years, hour/min/sec bounds, and trailing 'Z'.
 */
export function isValidCalendarTimestamp(ts: unknown): boolean {
  if (typeof ts !== 'string') return false;
  // Strict ISO 8601 UTC regex matching pattern in canonical schema
  const match = /^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,9})?Z$/.exec(ts);
  if (!match) return false;

  const splitParts = ts.slice(0, -1).split('T');
  const datePart = splitParts[0];
  if (!datePart) return false;
  const dateComponents = datePart.split('-');
  if (dateComponents.length !== 3) return false;
  const year = Number(dateComponents[0]);
  const month = Number(dateComponents[1]);
  const day = Number(dateComponents[2]);

  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
    return false;
  }

  // Month day bounds
  if ([4, 6, 9, 11].includes(month) && day > 30) {
    return false;
  }

  // February leap year check
  if (month === 2) {
    const isLeap = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
    if (isLeap && day > 29) return false;
    if (!isLeap && day > 28) return false;
  }

  return true;
}

/**
 * Safely normalizes environment aliases and action naming in a log event
 * without mutating the caller's input object.
 * Returns a new object that complies with canonical schema expectations.
 */
export function normalizeLogEvent<T extends object>(event: Readonly<T>): T {
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return event;
  }

  const record = event as Record<string, unknown>;
  const cloned = { ...record };

  if (cloned.service && typeof cloned.service === 'object' && !Array.isArray(cloned.service)) {
    const svc = { ...(cloned.service as Record<string, unknown>) };
    if (typeof svc.environment === 'string') {
      svc.environment = normalizeEnvironment(svc.environment);
    }
    cloned.service = svc;
  }

  if (cloned.event && typeof cloned.event === 'object' && !Array.isArray(cloned.event)) {
    const ev = { ...(cloned.event as Record<string, unknown>) };
    if (typeof ev.action === 'string') {
      ev.action = normalizeEventAction(ev.action);
    }
    cloned.event = ev;
  }

  return cloned as T;
}

/**
 * Validates a candidate log event object against the canonical JSON Schema v1.
 * Fast, cached JIT compilation using Ajv 2020 with cross-field timing and calendar date checks.
 */
export function validateLogEvent(candidate: unknown): ValidationResult {
  const errors: ValidationErrorDetail[] = [];

  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return {
      valid: false,
      errors: [{ path: '$', message: 'Log event must be a non-null JSON object', received: typeof candidate }],
    };
  }

  // 1. Schema-driven validation
  const isValid = compiledValidator(candidate);

  if (!isValid && compiledValidator.errors) {
    for (const err of compiledValidator.errors as ErrorObject[]) {
      const propPath = err.instancePath
        ? err.instancePath.replace(/^\//, '').replace(/\//g, '.')
        : (err.params?.missingProperty as string) || (err.params?.additionalProperty as string) || '$';

      // Avoid echoing full sensitive value payloads in diagnostic strings
      errors.push({
        path: propPath,
        message: err.message || 'Validation failed',
      });
    }
  }

  // 2. Real calendar timestamp validation (leap years, 30-day month limits)
  const record = candidate as Record<string, unknown>;
  if (typeof record['@timestamp'] === 'string' && !isValidCalendarTimestamp(record['@timestamp'])) {
    if (!errors.some((e) => e.path === '@timestamp')) {
      errors.push({
        path: '@timestamp',
        message: 'Invalid calendar date or timestamp value (e.g. non-existent day, leap day mismatch, or non-UTC)',
      });
    }
  }

  // 3. Cross-field timing check: event.duration (ns) vs skyra.duration_ms (ms)
  if (record['event'] && typeof record['event'] === 'object' && record['skyra'] && typeof record['skyra'] === 'object') {
    const eventObj = record['event'] as Record<string, unknown>;
    const skyraObj = record['skyra'] as Record<string, unknown>;
    if (typeof eventObj['duration'] === 'number' && typeof skyraObj['duration_ms'] === 'number') {
      const durationFromNs = eventObj['duration'] / 1_000_000;
      const diff = Math.abs(durationFromNs - skyraObj['duration_ms']);
      // 1.0 ms tolerance for floating point rounding
      if (diff > 1.0) {
        errors.push({
          path: 'skyra.duration_ms',
          message: `Timing mismatch: event.duration (${eventObj['duration']} ns = ${durationFromNs.toFixed(2)} ms) does not match skyra.duration_ms (${skyraObj['duration_ms']} ms)`,
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
