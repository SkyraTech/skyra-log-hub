import { Injectable, type PipeTransform, type ArgumentMetadata } from '@nestjs/common';
import type { AggregateRequestDto, AggregationItemDto } from '../dto/aggregate-request.dto.js';
import type { RawFilterInput } from '../../../query-execution/domain/query-filter.model.js';
import {
  InvalidArgumentException,
  UnsupportedFilterFieldException,
  UnsupportedFilterOperatorException,
  TimeRangeExceededException,
} from '../../../../common/errors/query.errors.js';
import { resolveCanonicalField } from '../../../query-execution/domain/canonical-field.model.js';

const ALLOWED_ENVELOPE_KEYS = new Set([
  'time_range',
  'projects',
  'environments',
  'services',
  'levels',
  'query_text',
  'filters',
  'aggregations',
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

const ALLOWED_INTERVALS: Record<string, number> = {
  '1m': 60 * 1000,
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
};

const MAX_HISTOGRAM_BUCKETS = 2000;
const MAX_TIME_RANGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const STRICT_UTC_REGEX = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,9})?Z$/;
const AGG_NAME_REGEX = /^[a-zA-Z0-9_]{1,32}$/;
const PROJECT_ID_REGEX = /^[a-z0-9_-]{1,64}$/;
const SERVICE_NAME_REGEX = /^[a-zA-Z0-9_.-]{1,64}$/;
const FILTER_FIELD_REGEX = /^[@a-z0-9_.]+$/;

@Injectable()
export class AggregateValidationPipe implements PipeTransform<unknown, AggregateRequestDto> {
  public transform(value: unknown, metadata?: ArgumentMetadata): AggregateRequestDto {
    if (metadata && metadata.type !== 'body') {
      return value as AggregateRequestDto;
    }

    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new InvalidArgumentException('Request body must be a valid JSON object.');
    }

    const raw = value as Record<string, unknown>;

    // 1. Reject unknown top-level envelope properties
    for (const key of Object.keys(raw)) {
      if (!ALLOWED_ENVELOPE_KEYS.has(key)) {
        throw new InvalidArgumentException(`Unknown request property "${key}" is not permitted.`);
      }
    }

    // 2. Validate time_range (required)
    if (!raw['time_range'] || typeof raw['time_range'] !== 'object' || Array.isArray(raw['time_range'])) {
      throw new InvalidArgumentException('Aggregate request must contain a "time_range" object with "start" and "end".');
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
    if (isNaN(startMs) || isNaN(endMs)) {
      throw new InvalidArgumentException('time_range timestamps must parse to valid calendar dates.');
    }

    if (endMs <= startMs) {
      throw new InvalidArgumentException('time_range.end must be strictly greater than time_range.start.');
    }

    if (endMs - startMs > MAX_TIME_RANGE_MS) {
      throw new TimeRangeExceededException(30);
    }

    // 3. Validate aggregations array (required, minItems: 1, maxItems: 5)
    if (!raw['aggregations'] || !Array.isArray(raw['aggregations']) || raw['aggregations'].length === 0) {
      throw new InvalidArgumentException('Aggregate request must contain at least one aggregation in "aggregations" array.');
    }

    if (raw['aggregations'].length > 5) {
      throw new InvalidArgumentException('Aggregate request cannot specify more than 5 aggregations per request.');
    }

    const seenNames = new Set<string>();
    const validatedAggregations: AggregationItemDto[] = [];

    for (let i = 0; i < raw['aggregations'].length; i++) {
      const agg = raw['aggregations'][i];
      if (!agg || typeof agg !== 'object' || Array.isArray(agg)) {
        throw new InvalidArgumentException(`Aggregation at index ${i} must be a valid JSON object.`);
      }

      for (const key of Object.keys(agg)) {
        if (!['name', 'type', 'field', 'interval', 'size'].includes(key)) {
          throw new InvalidArgumentException(`Unknown property "${key}" in aggregation at index ${i}.`);
        }
      }

      if (typeof agg.name !== 'string' || !AGG_NAME_REGEX.test(agg.name)) {
        throw new InvalidArgumentException(`Aggregation at index ${i} must have a valid alphanumeric "name" (1-32 chars).`);
      }

      if (seenNames.has(agg.name)) {
        throw new InvalidArgumentException(`Duplicate aggregation name "${agg.name}" is not permitted.`);
      }
      seenNames.add(agg.name);

      if (!['date_histogram', 'terms', 'cardinality'].includes(agg.type)) {
        throw new InvalidArgumentException(`Aggregation "${agg.name}" has unsupported type "${agg.type}". Must be date_histogram, terms, or cardinality.`);
      }

      if (typeof agg.field !== 'string' || !FILTER_FIELD_REGEX.test(agg.field)) {
        throw new InvalidArgumentException(`Aggregation "${agg.name}" must specify a valid canonical "field" path.`);
      }

      if (agg.type === 'date_histogram') {
        if (agg.field !== '@timestamp' && agg.field !== 'timestamp') {
          throw new InvalidArgumentException(`date_histogram aggregation "${agg.name}" must aggregate on field "@timestamp".`);
        }
        if (!agg.interval || typeof agg.interval !== 'string' || !(agg.interval in ALLOWED_INTERVALS)) {
          throw new InvalidArgumentException(`date_histogram aggregation "${agg.name}" requires a valid "interval" (1m, 5m, 15m, 1h, 6h, 1d).`);
        }
        const intervalMs = ALLOWED_INTERVALS[agg.interval]!;
        const bucketCount = (endMs - startMs) / intervalMs;
        if (bucketCount > MAX_HISTOGRAM_BUCKETS) {
          throw new InvalidArgumentException(
            `date_histogram aggregation "${agg.name}" with interval "${agg.interval}" exceeds maximum limit of ${MAX_HISTOGRAM_BUCKETS} buckets (calculated ${Math.ceil(bucketCount)}). Increase interval or narrow time range.`,
          );
        }
      } else {
        // terms or cardinality
        const resolved = resolveCanonicalField(agg.field);
        if (!resolved && agg.field !== 'environment') {
          throw new UnsupportedFilterFieldException(`Aggregation field "${agg.field}" is not in canonical allowlist.`);
        }
      }

      if (agg.type === 'terms') {
        if (agg.size !== undefined) {
          if (!Number.isInteger(agg.size) || agg.size < 1 || agg.size > 50) {
            throw new InvalidArgumentException(`terms aggregation "${agg.name}" size must be an integer between 1 and 50.`);
          }
        }
      }

      validatedAggregations.push({
        name: agg.name,
        type: agg.type,
        field: agg.field,
        interval: agg.interval,
        size: agg.size !== undefined ? Number(agg.size) : 10,
      });
    }

    // 4. Validate optional projects
    if (raw['projects'] !== undefined) {
      if (!Array.isArray(raw['projects'])) {
        throw new InvalidArgumentException('Property "projects" must be an array of strings.');
      }
      if (raw['projects'].length > 20) {
        throw new InvalidArgumentException('Property "projects" cannot exceed 20 items.');
      }
      for (const p of raw['projects']) {
        if (typeof p !== 'string' || !PROJECT_ID_REGEX.test(p)) {
          throw new InvalidArgumentException(`Invalid project ID format "${p}".`);
        }
      }
    }

    // 5. Validate optional environments
    if (raw['environments'] !== undefined) {
      if (!Array.isArray(raw['environments'])) {
        throw new InvalidArgumentException('Property "environments" must be an array of strings.');
      }
      if (raw['environments'].length > 5) {
        throw new InvalidArgumentException('Property "environments" cannot exceed 5 items.');
      }
      for (const env of raw['environments']) {
        if (typeof env !== 'string' || !ALLOWED_ENVIRONMENTS.has(env)) {
          throw new InvalidArgumentException(`Unknown environment "${env}". Must be one of: production, staging, development, test, local.`);
        }
      }
    }

    // 6. Validate optional services
    if (raw['services'] !== undefined) {
      if (!Array.isArray(raw['services'])) {
        throw new InvalidArgumentException('Property "services" must be an array of strings.');
      }
      if (raw['services'].length > 20) {
        throw new InvalidArgumentException('Property "services" cannot exceed 20 items.');
      }
      for (const s of raw['services']) {
        if (typeof s !== 'string' || !SERVICE_NAME_REGEX.test(s)) {
          throw new InvalidArgumentException(`Invalid service name "${s}".`);
        }
      }
    }

    // 7. Validate optional levels
    if (raw['levels'] !== undefined) {
      if (!Array.isArray(raw['levels'])) {
        throw new InvalidArgumentException('Property "levels" must be an array of strings.');
      }
      if (raw['levels'].length > 6) {
        throw new InvalidArgumentException('Property "levels" cannot exceed 6 items.');
      }
      for (const lvl of raw['levels']) {
        if (typeof lvl !== 'string' || !ALLOWED_LOG_LEVELS.has(lvl)) {
          throw new InvalidArgumentException(`Unknown log level "${lvl}".`);
        }
      }
    }

    // 8. Validate optional query_text
    if (raw['query_text'] !== undefined) {
      if (typeof raw['query_text'] !== 'string') {
        throw new InvalidArgumentException('Property "query_text" must be a string.');
      }
      if (raw['query_text'].length > 512) {
        throw new InvalidArgumentException('Property "query_text" cannot exceed 512 characters.');
      }
    }

    // 9. Validate optional structured filters
    if (raw['filters'] !== undefined) {
      if (!Array.isArray(raw['filters'])) {
        throw new InvalidArgumentException('Property "filters" must be an array.');
      }
      if (raw['filters'].length > 15) {
        throw new InvalidArgumentException('Filters array cannot exceed 15 items.');
      }
      for (let i = 0; i < raw['filters'].length; i++) {
        const f = raw['filters'][i];
        if (!f || typeof f !== 'object' || Array.isArray(f)) {
          throw new InvalidArgumentException(`Filter at index ${i} must be an object.`);
        }
        for (const fKey of Object.keys(f)) {
          if (fKey !== 'field' && fKey !== 'operator' && fKey !== 'value') {
            throw new InvalidArgumentException(`Unknown property "${fKey}" in filter at index ${i}.`);
          }
        }
        if (typeof f.field !== 'string' || !FILTER_FIELD_REGEX.test(f.field)) {
          throw new InvalidArgumentException(`Invalid filter field at index ${i}.`);
        }
        const fieldResolved = resolveCanonicalField(f.field);
        if (!fieldResolved) {
          throw new UnsupportedFilterFieldException(`Filter field "${f.field}" is not in canonical allowlist.`);
        }
        if (typeof f.operator !== 'string' || !ALLOWED_FILTER_OPERATORS.has(f.operator)) {
          throw new UnsupportedFilterOperatorException(`Filter operator "${f.operator}" is not supported.`);
        }
      }
    }

    return {
      time_range: {
        start: tr['start'] as string,
        end: tr['end'] as string,
      },
      projects: raw['projects'] as string[] | undefined,
      environments: raw['environments'] as string[] | undefined,
      services: raw['services'] as string[] | undefined,
      levels: raw['levels'] as string[] | undefined,
      query_text: raw['query_text'] as string | undefined,
      filters: raw['filters'] as RawFilterInput[] | undefined,
      aggregations: validatedAggregations,
    };
  }
}
