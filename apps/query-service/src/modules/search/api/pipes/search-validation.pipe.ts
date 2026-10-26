import { Injectable, type PipeTransform, type ArgumentMetadata } from '@nestjs/common';
import type { SearchRequestDto } from '../dto/search-request.dto.js';
import {
  InvalidArgumentException,
  UnsupportedFilterFieldException,
  UnsupportedFilterOperatorException,
} from '../../../../common/errors/query.errors.js';

const ALLOWED_ENVELOPE_KEYS = new Set([
  'time_range',
  'projects',
  'environments',
  'services',
  'levels',
  'query_text',
  'trace_id',
  'event_id',
  'filters',
  'sort',
  'limit',
  'cursor',
]);

const ALLOWED_FILTER_OPERATORS = new Set([
  'eq',
  'neq',
  'in',
  'not_in',
  'contains',
  'exists',
  'gt',
  'gte',
  'lt',
  'lte',
]);

const ALLOWED_ENVIRONMENTS = new Set([
  'production',
  'staging',
  'development',
  'test',
  'local',
]);

const ALLOWED_LOG_LEVELS = new Set([
  'trace',
  'debug',
  'info',
  'warn',
  'error',
  'fatal',
]);

const STRICT_UTC_REGEX = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,9})?Z$/;
const PROJECT_ID_REGEX = /^[a-z0-9_-]{1,64}$/;
const SERVICE_NAME_REGEX = /^[a-zA-Z0-9_.-]{1,64}$/;
const TRACE_ID_REGEX = /^[0-9a-f]{32}$/;
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FILTER_FIELD_REGEX = /^[@a-z0-9_.]+$/;

@Injectable()
export class SearchValidationPipe implements PipeTransform<unknown, SearchRequestDto> {
  public transform(value: unknown, metadata?: ArgumentMetadata): SearchRequestDto {
    if (metadata && metadata.type !== 'body') {
      return value as SearchRequestDto;
    }

    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new InvalidArgumentException('Request body must be a valid JSON object.');
    }

    const raw = value as Record<string, unknown>;

    // 1. Reject unknown top-level envelope properties (additionalProperties: false)
    for (const key of Object.keys(raw)) {
      if (!ALLOWED_ENVELOPE_KEYS.has(key)) {
        throw new InvalidArgumentException(`Unknown request property "${key}" is not permitted.`);
      }
    }

    // 2. Validate time_range (required)
    if (!raw['time_range'] || typeof raw['time_range'] !== 'object' || Array.isArray(raw['time_range'])) {
      throw new InvalidArgumentException('Search request must contain a "time_range" object with "start" and "end".');
    }

    const tr = raw['time_range'] as Record<string, unknown>;
    for (const key of Object.keys(tr)) {
      if (key !== 'start' && key !== 'end') {
        throw new InvalidArgumentException(`Unknown property "${key}" in "time_range" object.`);
      }
    }

    if (typeof tr['start'] !== 'string' || !STRICT_UTC_REGEX.test(tr['start'])) {
      throw new InvalidArgumentException('time_range.start must be a valid RFC 3339 UTC timestamp ending in Z.');
    }

    if (typeof tr['end'] !== 'string' || !STRICT_UTC_REGEX.test(tr['end'])) {
      throw new InvalidArgumentException('time_range.end must be a valid RFC 3339 UTC timestamp ending in Z.');
    }

    const startMs = Date.parse(tr['start']);
    const endMs = Date.parse(tr['end']);
    if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
      throw new InvalidArgumentException('time_range timestamps must be valid date-times.');
    }
    if (endMs <= startMs) {
      throw new InvalidArgumentException('time_range.end must be strictly greater than time_range.start.');
    }

    // 3. Validate projects
    if (raw['projects'] !== undefined) {
      if (!Array.isArray(raw['projects'])) {
        throw new InvalidArgumentException('"projects" must be an array of strings.');
      }
      if (raw['projects'].length > 20) {
        throw new InvalidArgumentException('"projects" array exceeds maximum allowed item count of 20.');
      }
      for (const p of raw['projects']) {
        if (typeof p !== 'string' || !PROJECT_ID_REGEX.test(p)) {
          throw new InvalidArgumentException(`Invalid project ID "${String(p)}". Must match pattern [a-z0-9_-]{1,64}.`);
        }
      }
    }

    // 4. Validate environments
    if (raw['environments'] !== undefined) {
      if (!Array.isArray(raw['environments'])) {
        throw new InvalidArgumentException('"environments" must be an array of strings.');
      }
      if (raw['environments'].length > 5) {
        throw new InvalidArgumentException('"environments" array exceeds maximum allowed item count of 5.');
      }
      for (const env of raw['environments']) {
        if (typeof env !== 'string' || !ALLOWED_ENVIRONMENTS.has(env)) {
          throw new InvalidArgumentException(`Invalid environment "${String(env)}". Permitted: ${[...ALLOWED_ENVIRONMENTS].join(', ')}.`);
        }
      }
    }

    // 5. Validate services
    if (raw['services'] !== undefined) {
      if (!Array.isArray(raw['services'])) {
        throw new InvalidArgumentException('"services" must be an array of strings.');
      }
      if (raw['services'].length > 20) {
        throw new InvalidArgumentException('"services" array exceeds maximum allowed item count of 20.');
      }
      for (const svc of raw['services']) {
        if (typeof svc !== 'string' || !SERVICE_NAME_REGEX.test(svc)) {
          throw new InvalidArgumentException(`Invalid service name "${String(svc)}". Must match pattern [a-zA-Z0-9_.-]{1,64}.`);
        }
      }
    }

    // 6. Validate levels
    if (raw['levels'] !== undefined) {
      if (!Array.isArray(raw['levels'])) {
        throw new InvalidArgumentException('"levels" must be an array of strings.');
      }
      if (raw['levels'].length > 6) {
        throw new InvalidArgumentException('"levels" array exceeds maximum allowed item count of 6.');
      }
      for (const lvl of raw['levels']) {
        if (typeof lvl !== 'string' || !ALLOWED_LOG_LEVELS.has(lvl)) {
          throw new InvalidArgumentException(`Invalid log level "${String(lvl)}". Permitted: ${[...ALLOWED_LOG_LEVELS].join(', ')}.`);
        }
      }
    }

    // 7. Validate query_text
    if (raw['query_text'] !== undefined) {
      if (typeof raw['query_text'] !== 'string') {
        throw new InvalidArgumentException('"query_text" must be a string.');
      }
      if (raw['query_text'].length > 512) {
        throw new InvalidArgumentException('"query_text" exceeds maximum allowed length of 512 characters.');
      }
    }

    // 8. Validate trace_id
    if (raw['trace_id'] !== undefined) {
      if (typeof raw['trace_id'] !== 'string' || !TRACE_ID_REGEX.test(raw['trace_id'])) {
        throw new InvalidArgumentException('"trace_id" must be a 32-character hexadecimal W3C trace ID.');
      }
    }

    // 9. Validate event_id
    if (raw['event_id'] !== undefined) {
      if (typeof raw['event_id'] !== 'string' || !UUID_V4_REGEX.test(raw['event_id'])) {
        throw new InvalidArgumentException('"event_id" must be a valid RFC 4122 UUIDv4 string.');
      }
    }

    // 10. Validate filters
    if (raw['filters'] !== undefined) {
      if (!Array.isArray(raw['filters'])) {
        throw new InvalidArgumentException('"filters" must be an array of filter objects.');
      }
      if (raw['filters'].length > 15) {
        throw new InvalidArgumentException('"filters" exceeds maximum allowed count of 15 predicates.');
      }
      for (let i = 0; i < raw['filters'].length; i++) {
        const f = raw['filters'][i];
        if (!f || typeof f !== 'object' || Array.isArray(f)) {
          throw new InvalidArgumentException(`Filter at index ${i} must be a JSON object.`);
        }
        for (const k of Object.keys(f)) {
          if (k !== 'field' && k !== 'operator' && k !== 'value') {
            throw new InvalidArgumentException(`Filter at index ${i} has unknown property "${k}".`);
          }
        }
        if (!f.field || typeof f.field !== 'string' || !FILTER_FIELD_REGEX.test(f.field) || f.field.length > 64) {
          throw new UnsupportedFilterFieldException(
            `Filter at index ${i} has invalid field "${String(f.field)}". Must match pattern [@a-z0-9_.] up to 64 chars.`,
          );
        }
        if (!f.operator || typeof f.operator !== 'string' || !ALLOWED_FILTER_OPERATORS.has(f.operator)) {
          throw new UnsupportedFilterOperatorException(
            `Filter at index ${i} has unsupported operator "${String(f.operator)}".`,
          );
        }
      }
    }

    // 11. Validate sort
    if (raw['sort'] !== undefined) {
      if (!raw['sort'] || typeof raw['sort'] !== 'object' || Array.isArray(raw['sort'])) {
        throw new InvalidArgumentException('"sort" must be a JSON object.');
      }
      const s = raw['sort'] as Record<string, unknown>;
      for (const k of Object.keys(s)) {
        if (k !== 'field' && k !== 'direction') {
          throw new InvalidArgumentException(`Unknown property "${k}" in "sort" object.`);
        }
      }
      if (s['field'] !== undefined && s['field'] !== '@timestamp') {
        throw new InvalidArgumentException(`Sorting by field "${String(s['field'])}" is not permitted. Only "@timestamp" is supported.`);
      }
      if (s['direction'] !== undefined && s['direction'] !== 'asc' && s['direction'] !== 'desc') {
        throw new InvalidArgumentException(`Sort direction "${String(s['direction'])}" is invalid. Must be "asc" or "desc".`);
      }
    }

    // 12. Validate limit
    if (raw['limit'] !== undefined) {
      if (typeof raw['limit'] !== 'number' || !Number.isInteger(raw['limit']) || raw['limit'] < 1 || raw['limit'] > 500) {
        throw new InvalidArgumentException('"limit" must be an integer between 1 and 500.');
      }
    }

    // 13. Validate cursor
    if (raw['cursor'] !== undefined) {
      if (typeof raw['cursor'] !== 'string' || raw['cursor'].length === 0 || raw['cursor'].length > 1024) {
        throw new InvalidArgumentException('"cursor" must be a non-empty string up to 1024 characters.');
      }
    }

    return raw as unknown as SearchRequestDto;
  }
}
