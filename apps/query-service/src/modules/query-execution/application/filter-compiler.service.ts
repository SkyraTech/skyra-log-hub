import { Injectable } from '@nestjs/common';
import {
  resolveCanonicalField,
  type CanonicalFieldDefinition,
} from '../domain/canonical-field.model.js';
import type {
  FilterAstNode,
  BinaryFilterAstNode,
  InFilterAstNode,
  ContainsFilterAstNode,
  ExistsFilterAstNode,
  LogicalFilterAstNode,
  RawFilterInput,
} from '../domain/query-filter.model.js';
import { InvalidArgumentException } from '../../../common/errors/query.errors.js';

export const MAX_FILTER_COUNT = 15;
export const MAX_IN_ARRAY_LENGTH = 100;
export const MAX_STRING_FILTER_LENGTH = 512;

@Injectable()
export class FilterCompilerService {
  /**
   * Compiles an array of raw client filter inputs into a validated FilterAstNode.
   */
  public compileFilters(rawFilters?: readonly RawFilterInput[]): FilterAstNode | undefined {
    if (!rawFilters || rawFilters.length === 0) {
      return undefined;
    }

    if (rawFilters.length > MAX_FILTER_COUNT) {
      throw new InvalidArgumentException(
        `A maximum of ${MAX_FILTER_COUNT} structured filters is permitted per query. Received ${rawFilters.length}.`,
      );
    }

    const astNodes: FilterAstNode[] = [];

    for (let i = 0; i < rawFilters.length; i++) {
      const raw = rawFilters[i];
      if (!raw) continue;
      const node = this.compileSingleFilter(raw, i);
      astNodes.push(node);
    }

    if (astNodes.length === 1) {
      return astNodes[0];
    }

    return {
      kind: 'logical',
      operator: 'and',
      children: astNodes,
    } satisfies LogicalFilterAstNode;
  }

  public compileSingleFilter(raw: RawFilterInput, index = 0): FilterAstNode {
    if (!raw || typeof raw !== 'object') {
      throw new InvalidArgumentException(`Filter at index ${index} must be an object.`);
    }

    if (!raw.field || typeof raw.field !== 'string') {
      throw new InvalidArgumentException(`Filter at index ${index} is missing required string "field".`);
    }

    const field = resolveCanonicalField(raw.field);
    if (!field) {
      throw new InvalidArgumentException(
        `Field "${raw.field}" at filter index ${index} is not an allowlisted canonical field path or alias.`,
      );
    }

    if (!raw.operator || typeof raw.operator !== 'string') {
      throw new InvalidArgumentException(
        `Filter for field "${field.canonicalPath}" is missing required string "operator".`,
      );
    }

    if (!field.supportedOperators.includes(raw.operator)) {
      throw new InvalidArgumentException(
        `Operator "${raw.operator}" is not supported for field "${field.canonicalPath}". Supported operators: ${field.supportedOperators.join(', ')}.`,
      );
    }

    switch (raw.operator) {
      case 'exists':
        return this.compileExistsFilter(field, raw.value);

      case 'contains':
        return this.compileContainsFilter(field, raw.value);

      case 'in':
      case 'not_in':
        return this.compileInFilter(field, raw.operator, raw.value);

      case 'eq':
      case 'neq':
      case 'gt':
      case 'gte':
      case 'lt':
      case 'lte':
        return this.compileBinaryFilter(field, raw.operator, raw.value);

      default: {
        const _exhaustiveCheck: never = raw.operator;
        throw new InvalidArgumentException(`Unhandled filter operator: ${_exhaustiveCheck}`);
      }
    }
  }

  private compileExistsFilter(
    field: CanonicalFieldDefinition,
    value: unknown,
  ): ExistsFilterAstNode {
    let exists = true;
    if (value !== undefined && value !== null) {
      if (typeof value !== 'boolean') {
        throw new InvalidArgumentException(
          `Filter "exists" value for field "${field.canonicalPath}" must be a boolean if provided.`,
        );
      }
      exists = value;
    }

    return {
      kind: 'exists',
      field,
      exists,
    };
  }

  private compileContainsFilter(
    field: CanonicalFieldDefinition,
    value: unknown,
  ): ContainsFilterAstNode {
    if (typeof value !== 'string') {
      throw new InvalidArgumentException(
        `Filter "contains" value for field "${field.canonicalPath}" must be a non-empty string.`,
      );
    }

    const trimmed = value.trim();
    if (trimmed.length === 0) {
      throw new InvalidArgumentException(
        `Filter "contains" value for field "${field.canonicalPath}" cannot be empty.`,
      );
    }

    if (trimmed.length > MAX_STRING_FILTER_LENGTH) {
      throw new InvalidArgumentException(
        `Filter "contains" substring for field "${field.canonicalPath}" exceeds maximum length of ${MAX_STRING_FILTER_LENGTH} characters.`,
      );
    }

    return {
      kind: 'contains',
      field,
      substring: trimmed,
    };
  }

  private compileInFilter(
    field: CanonicalFieldDefinition,
    operator: 'in' | 'not_in',
    value: unknown,
  ): InFilterAstNode {
    if (!Array.isArray(value) || value.length === 0) {
      throw new InvalidArgumentException(
        `Filter "${operator}" for field "${field.canonicalPath}" must provide a non-empty array of values.`,
      );
    }

    if (value.length > MAX_IN_ARRAY_LENGTH) {
      throw new InvalidArgumentException(
        `Filter "${operator}" array for field "${field.canonicalPath}" exceeds maximum allowed length of ${MAX_IN_ARRAY_LENGTH} items.`,
      );
    }

    const validatedValues: (string | number)[] = [];

    for (let i = 0; i < value.length; i++) {
      const item = value[i];
      if (field.dataType === 'number') {
        if (typeof item !== 'number' || !Number.isFinite(item)) {
          throw new InvalidArgumentException(
            `Filter "${operator}" value at item index ${i} for field "${field.canonicalPath}" must be a finite number.`,
          );
        }
        validatedValues.push(item);
      } else {
        if (typeof item !== 'string' || item.length === 0) {
          throw new InvalidArgumentException(
            `Filter "${operator}" value at item index ${i} for field "${field.canonicalPath}" must be a non-empty string.`,
          );
        }
        if (item.length > MAX_STRING_FILTER_LENGTH) {
          throw new InvalidArgumentException(
            `Filter "${operator}" string value at item index ${i} for field "${field.canonicalPath}" exceeds maximum length of ${MAX_STRING_FILTER_LENGTH} characters.`,
          );
        }
        validatedValues.push(item);
      }
    }

    return {
      kind: 'in',
      field,
      operator,
      values: validatedValues,
    };
  }

  private compileBinaryFilter(
    field: CanonicalFieldDefinition,
    operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte',
    value: unknown,
  ): BinaryFilterAstNode {
    if (field.dataType === 'number') {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new InvalidArgumentException(
          `Filter "${operator}" value for numeric field "${field.canonicalPath}" must be a finite number.`,
        );
      }
      return {
        kind: 'binary',
        field,
        operator,
        value,
      };
    }

    if (field.dataType === 'timestamp') {
      if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
        throw new InvalidArgumentException(
          `Filter "${operator}" value for timestamp field "${field.canonicalPath}" must be a valid ISO 8601 UTC date string.`,
        );
      }
      return {
        kind: 'binary',
        field,
        operator,
        value: new Date(value).toISOString(),
      };
    }

    // Default: string
    if (typeof value !== 'string') {
      throw new InvalidArgumentException(
        `Filter "${operator}" value for field "${field.canonicalPath}" must be a string.`,
      );
    }

    if (value.length > MAX_STRING_FILTER_LENGTH) {
      throw new InvalidArgumentException(
        `Filter "${operator}" value for field "${field.canonicalPath}" exceeds maximum length of ${MAX_STRING_FILTER_LENGTH} characters.`,
      );
    }

    return {
      kind: 'binary',
      field,
      operator,
      value,
    };
  }
}
