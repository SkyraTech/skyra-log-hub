import { Injectable, type PipeTransform, type ArgumentMetadata } from '@nestjs/common';
import type { FacetsRequestDto } from '../dto/facets-request.dto.js';
import type { AllowedFacetField } from '../../domain/facet.model.js';
import {
  InvalidArgumentException,
  TimeRangeExceededException,
} from '../../../../common/errors/query.errors.js';

const ALLOWED_ENVELOPE_KEYS = new Set([
  'time_range',
  'projects',
  'environments',
  'facet_fields',
]);

const ALLOWED_FACET_FIELDS = new Set<AllowedFacetField>([
  'service.name',
  'log.level',
  'event.action',
  'environment',
  'error.type',
]);

const ALLOWED_ENVIRONMENTS = new Set([
  'production',
  'staging',
  'development',
  'test',
  'local',
]);

const MAX_TIME_RANGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const STRICT_UTC_REGEX = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,9})?Z$/;
const PROJECT_ID_REGEX = /^[a-z0-9_-]{1,64}$/;

@Injectable()
export class FacetsValidationPipe implements PipeTransform<unknown, FacetsRequestDto> {
  public transform(value: unknown, metadata?: ArgumentMetadata): FacetsRequestDto {
    if (metadata && metadata.type !== 'body') {
      return value as FacetsRequestDto;
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
      throw new InvalidArgumentException('Facets request must contain a "time_range" object with "start" and "end".');
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

    // 3. Validate facet_fields (required, minItems: 1, maxItems: 10)
    if (!raw['facet_fields'] || !Array.isArray(raw['facet_fields']) || raw['facet_fields'].length === 0) {
      throw new InvalidArgumentException('Facets request must specify at least one field in "facet_fields" array.');
    }

    if (raw['facet_fields'].length > 10) {
      throw new InvalidArgumentException('"facet_fields" cannot exceed 10 fields.');
    }

    const seenFields = new Set<string>();
    const validatedFacetFields: AllowedFacetField[] = [];

    for (const f of raw['facet_fields']) {
      if (typeof f !== 'string' || !ALLOWED_FACET_FIELDS.has(f as AllowedFacetField)) {
        throw new InvalidArgumentException(`Unsupported facet field "${f}". Must be one of: service.name, log.level, event.action, environment, error.type.`);
      }
      if (seenFields.has(f)) {
        throw new InvalidArgumentException(`Duplicate facet field "${f}" is not permitted.`);
      }
      seenFields.add(f);
      validatedFacetFields.push(f as AllowedFacetField);
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

    return {
      time_range: {
        start: tr['start'] as string,
        end: tr['end'] as string,
      },
      projects: raw['projects'] as string[] | undefined,
      environments: raw['environments'] as string[] | undefined,
      facet_fields: validatedFacetFields,
    };
  }
}
