import type {
  CanonicalFieldDefinition,
  SupportedFilterOperator,
} from './canonical-field.model.js';

export interface BinaryFilterAstNode {
  readonly kind: 'binary';
  readonly field: CanonicalFieldDefinition;
  readonly operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte';
  readonly value: string | number;
}

export interface InFilterAstNode {
  readonly kind: 'in';
  readonly field: CanonicalFieldDefinition;
  readonly operator: 'in' | 'not_in';
  readonly values: readonly (string | number)[];
}

export interface ContainsFilterAstNode {
  readonly kind: 'contains';
  readonly field: CanonicalFieldDefinition;
  readonly substring: string;
}

export interface ExistsFilterAstNode {
  readonly kind: 'exists';
  readonly field: CanonicalFieldDefinition;
  readonly exists: boolean;
}

export interface LogicalFilterAstNode {
  readonly kind: 'logical';
  readonly operator: 'and' | 'or';
  readonly children: readonly FilterAstNode[];
}

export type FilterAstNode =
  | BinaryFilterAstNode
  | InFilterAstNode
  | ContainsFilterAstNode
  | ExistsFilterAstNode
  | LogicalFilterAstNode;

export interface RawFilterInput {
  readonly field: string;
  readonly operator: SupportedFilterOperator;
  readonly value?: unknown;
}
