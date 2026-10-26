import { Injectable, type PipeTransform, type ArgumentMetadata } from '@nestjs/common';
import {
  InvalidArgumentException,
  type InvalidParamError,
} from '../errors/query.errors.js';
import type { DiscoverArchiveSegmentsRequestDto } from '../../modules/archive-discovery/api/dto/discovery-request.dto.js';

const ALLOWED_REQUEST_KEYS = new Set([
  'time_range',
  'projects',
  'environments',
  'services',
  'start_date',
  'startDate',
  'end_date',
  'endDate',
  'limit',
]);

const ALLOWED_ENVIRONMENTS = new Set([
  'production',
  'staging',
  'development',
  'test',
  'local',
]);

const IDENTIFIER_REGEX = /^[a-z0-9_-]{1,64}$/;
const DATE_REGEX = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const ISO_DATE_TIME_REGEX = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d+)?Z$/;

@Injectable()
export class DiscoveryValidationPipe implements PipeTransform {
  public transform(value: unknown, metadata: ArgumentMetadata): DiscoverArchiveSegmentsRequestDto {
    // Only validate body payloads
    if (metadata.type !== 'body') {
      return value as DiscoverArchiveSegmentsRequestDto;
    }

    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new InvalidArgumentException(
        'Request body must be a valid JSON object.',
        [{ name: 'body', reason: 'Expected a JSON object envelope.' }],
      );
    }

    const raw = value as Record<string, unknown>;
    const invalidParams: InvalidParamError[] = [];

    // 1. Strict unknown-field rejection
    for (const key of Object.keys(raw)) {
      if (!ALLOWED_REQUEST_KEYS.has(key)) {
        invalidParams.push({
          name: key,
          reason: `Unknown or disallowed property "${key}". Allowed properties: ${[...ALLOWED_REQUEST_KEYS].join(', ')}.`,
        });
      }
    }

    // 2. time_range validation
    if (raw['time_range'] !== undefined) {
      const tr = raw['time_range'];
      if (typeof tr !== 'object' || tr === null || Array.isArray(tr)) {
        invalidParams.push({
          name: 'time_range',
          reason: 'Expected an object with optional "start" and "end" ISO 8601 timestamps.',
        });
      } else {
        const trObj = tr as Record<string, unknown>;
        for (const trKey of Object.keys(trObj)) {
          if (trKey !== 'start' && trKey !== 'end') {
            invalidParams.push({
              name: `time_range.${trKey}`,
              reason: `Disallowed property in time_range. Only "start" and "end" are permitted.`,
            });
          }
        }

        if (trObj['start'] !== undefined) {
          if (typeof trObj['start'] !== 'string' || !ISO_DATE_TIME_REGEX.test(trObj['start'])) {
            invalidParams.push({
              name: 'time_range.start',
              reason: 'Must be a valid ISO 8601 UTC date-time string (e.g. "2026-10-25T00:00:00Z").',
            });
          }
        }

        if (trObj['end'] !== undefined) {
          if (typeof trObj['end'] !== 'string' || !ISO_DATE_TIME_REGEX.test(trObj['end'])) {
            invalidParams.push({
              name: 'time_range.end',
              reason: 'Must be a valid ISO 8601 UTC date-time string (e.g. "2026-10-25T23:59:59Z").',
            });
          }
        }
      }
    }

    // 3. projects validation
    if (raw['projects'] !== undefined) {
      if (!Array.isArray(raw['projects'])) {
        invalidParams.push({
          name: 'projects',
          reason: 'Expected an array of project ID strings.',
        });
      } else {
        if (raw['projects'].length > 100) {
          invalidParams.push({
            name: 'projects',
            reason: 'Project list exceeds maximum allowable limit of 100 projects per discovery call.',
          });
        }
        raw['projects'].forEach((proj, idx) => {
          if (typeof proj !== 'string' || !IDENTIFIER_REGEX.test(proj)) {
            invalidParams.push({
              name: `projects[${idx}]`,
              reason: `Invalid project identifier "${String(proj)}". Must be 1-64 lowercase alphanumeric characters with dashes or underscores.`,
            });
          }
        });
      }
    }

    // 4. environments validation
    if (raw['environments'] !== undefined) {
      if (!Array.isArray(raw['environments'])) {
        invalidParams.push({
          name: 'environments',
          reason: 'Expected an array of environment names.',
        });
      } else {
        raw['environments'].forEach((env, idx) => {
          if (typeof env !== 'string' || !ALLOWED_ENVIRONMENTS.has(env)) {
            invalidParams.push({
              name: `environments[${idx}]`,
              reason: `Invalid environment "${String(env)}". Allowed values: ${[...ALLOWED_ENVIRONMENTS].join(', ')}.`,
            });
          }
        });
      }
    }

    // 5. services validation
    if (raw['services'] !== undefined) {
      if (!Array.isArray(raw['services'])) {
        invalidParams.push({
          name: 'services',
          reason: 'Expected an array of service name strings.',
        });
      } else {
        raw['services'].forEach((svc, idx) => {
          if (typeof svc !== 'string' || !IDENTIFIER_REGEX.test(svc)) {
            invalidParams.push({
              name: `services[${idx}]`,
              reason: `Invalid service name "${String(svc)}". Must match pattern [a-z0-9_-]{1,64}.`,
            });
          }
        });
      }
    }

    // 6. start_date / startDate & end_date / endDate validation
    const startDateVal = raw['start_date'] ?? raw['startDate'];
    if (startDateVal !== undefined) {
      if (typeof startDateVal !== 'string' || !DATE_REGEX.test(startDateVal)) {
        invalidParams.push({
          name: raw['start_date'] !== undefined ? 'start_date' : 'startDate',
          reason: 'Must be a valid calendar date formatted as YYYY-MM-DD.',
        });
      } else {
        raw['start_date'] = startDateVal;
      }
    }

    const endDateVal = raw['end_date'] ?? raw['endDate'];
    if (endDateVal !== undefined) {
      if (typeof endDateVal !== 'string' || !DATE_REGEX.test(endDateVal)) {
        invalidParams.push({
          name: raw['end_date'] !== undefined ? 'end_date' : 'endDate',
          reason: 'Must be a valid calendar date formatted as YYYY-MM-DD.',
        });
      } else {
        raw['end_date'] = endDateVal;
      }
    }

    // 7. limit validation
    if (raw['limit'] !== undefined) {
      const limitVal = raw['limit'];
      if (
        typeof limitVal !== 'number' ||
        !Number.isInteger(limitVal) ||
        limitVal < 1 ||
        limitVal > 2000
      ) {
        invalidParams.push({
          name: 'limit',
          reason: 'Must be an integer between 1 and 2000.',
        });
      }
    }

    if (invalidParams.length > 0) {
      throw new InvalidArgumentException(
        'Request validation failed for archive discovery filters.',
        invalidParams,
      );
    }

    return raw as unknown as DiscoverArchiveSegmentsRequestDto;
  }
}
