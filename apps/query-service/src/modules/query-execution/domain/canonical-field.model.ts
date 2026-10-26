export type CanonicalFieldType = 'string' | 'number' | 'timestamp' | 'boolean';

export type SupportedFilterOperator =
  | 'eq'
  | 'neq'
  | 'in'
  | 'not_in'
  | 'contains'
  | 'exists'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte';

export interface CanonicalFieldDefinition {
  readonly canonicalPath: string;
  readonly queryAlias: string;
  readonly jsonPath: string;
  readonly dataType: CanonicalFieldType;
  readonly nullable: boolean;
  readonly supportedOperators: readonly SupportedFilterOperator[];
  readonly sortable: boolean;
}

export const CANONICAL_FIELD_CATALOG: readonly CanonicalFieldDefinition[] = [
  {
    canonicalPath: '@timestamp',
    queryAlias: 'timestamp',
    jsonPath: '$."@timestamp"',
    dataType: 'timestamp',
    nullable: false,
    supportedOperators: ['eq', 'gt', 'gte', 'lt', 'lte'],
    sortable: true,
  },
  {
    canonicalPath: 'event.id',
    queryAlias: 'event_id',
    jsonPath: '$.event.id',
    dataType: 'string',
    nullable: false,
    supportedOperators: ['eq', 'in'],
    sortable: true,
  },
  {
    canonicalPath: 'event.action',
    queryAlias: 'action',
    jsonPath: '$.event.action',
    dataType: 'string',
    nullable: true,
    supportedOperators: ['eq', 'in', 'exists'],
    sortable: true,
  },
  {
    canonicalPath: 'event.kind',
    queryAlias: 'kind',
    jsonPath: '$.event.kind',
    dataType: 'string',
    nullable: true,
    supportedOperators: ['eq', 'in'],
    sortable: false,
  },
  {
    canonicalPath: 'log.level',
    queryAlias: 'level',
    jsonPath: '$.log.level',
    dataType: 'string',
    nullable: false,
    supportedOperators: ['eq', 'in'],
    sortable: true,
  },
  {
    canonicalPath: 'message',
    queryAlias: 'message',
    jsonPath: '$.message',
    dataType: 'string',
    nullable: false,
    supportedOperators: ['contains', 'eq'],
    sortable: false,
  },
  {
    canonicalPath: 'service.name',
    queryAlias: 'service',
    jsonPath: '$.service.name',
    dataType: 'string',
    nullable: false,
    supportedOperators: ['eq', 'in'],
    sortable: true,
  },
  {
    canonicalPath: 'service.environment',
    queryAlias: 'environment',
    jsonPath: '$.service.environment',
    dataType: 'string',
    nullable: false,
    supportedOperators: ['eq', 'in'],
    sortable: true,
  },
  {
    canonicalPath: 'service.version',
    queryAlias: 'service_version',
    jsonPath: '$.service.version',
    dataType: 'string',
    nullable: true,
    supportedOperators: ['eq', 'in', 'exists'],
    sortable: false,
  },
  {
    canonicalPath: 'trace.id',
    queryAlias: 'trace_id',
    jsonPath: '$.trace.id',
    dataType: 'string',
    nullable: true,
    supportedOperators: ['eq', 'in', 'exists'],
    sortable: false,
  },
  {
    canonicalPath: 'span.id',
    queryAlias: 'span_id',
    jsonPath: '$.span.id',
    dataType: 'string',
    nullable: true,
    supportedOperators: ['eq', 'exists'],
    sortable: false,
  },
  {
    canonicalPath: 'error.type',
    queryAlias: 'error_type',
    jsonPath: '$.error.type',
    dataType: 'string',
    nullable: true,
    supportedOperators: ['eq', 'in', 'exists'],
    sortable: true,
  },
  {
    canonicalPath: 'error.message',
    queryAlias: 'error_message',
    jsonPath: '$.error.message',
    dataType: 'string',
    nullable: true,
    supportedOperators: ['contains', 'exists'],
    sortable: false,
  },
  {
    canonicalPath: 'error.stack_trace',
    queryAlias: 'stack_trace',
    jsonPath: '$.error.stack_trace',
    dataType: 'string',
    nullable: true,
    supportedOperators: ['exists'],
    sortable: false,
  },
  {
    canonicalPath: 'http.request.method',
    queryAlias: 'http_method',
    jsonPath: '$.http.request.method',
    dataType: 'string',
    nullable: true,
    supportedOperators: ['eq', 'in', 'exists'],
    sortable: false,
  },
  {
    canonicalPath: 'http.response.status_code',
    queryAlias: 'status_code',
    jsonPath: '$.http.response.status_code',
    dataType: 'number',
    nullable: true,
    supportedOperators: ['eq', 'in', 'gt', 'gte', 'lt', 'lte', 'exists'],
    sortable: true,
  },
  {
    canonicalPath: 'http.url',
    queryAlias: 'url',
    jsonPath: '$.http.url',
    dataType: 'string',
    nullable: true,
    supportedOperators: ['contains', 'eq', 'exists'],
    sortable: false,
  },
  {
    canonicalPath: 'user.id',
    queryAlias: 'user_id',
    jsonPath: '$.user.id',
    dataType: 'string',
    nullable: true,
    supportedOperators: ['eq', 'in', 'exists'],
    sortable: false,
  },
  {
    canonicalPath: 'skyra.tenant_id',
    queryAlias: 'tenant_id',
    jsonPath: '$.skyra.tenant_id',
    dataType: 'string',
    nullable: false,
    supportedOperators: ['eq'],
    sortable: false,
  },
  {
    canonicalPath: 'skyra.project_id',
    queryAlias: 'project_id',
    jsonPath: '$.skyra.project_id',
    dataType: 'string',
    nullable: false,
    supportedOperators: ['eq', 'in'],
    sortable: true,
  },
  {
    canonicalPath: 'skyra.environment',
    queryAlias: 'skyra_environment',
    jsonPath: '$.skyra.environment',
    dataType: 'string',
    nullable: false,
    supportedOperators: ['eq', 'in'],
    sortable: true,
  },
];

const FIELD_BY_PATH_MAP = new Map<string, CanonicalFieldDefinition>();
const FIELD_BY_ALIAS_MAP = new Map<string, CanonicalFieldDefinition>();

for (const field of CANONICAL_FIELD_CATALOG) {
  FIELD_BY_PATH_MAP.set(field.canonicalPath.toLowerCase(), field);
  FIELD_BY_ALIAS_MAP.set(field.queryAlias.toLowerCase(), field);
}

export function resolveCanonicalField(identifier: string): CanonicalFieldDefinition | undefined {
  if (!identifier || typeof identifier !== 'string') {
    return undefined;
  }
  const clean = identifier.trim().toLowerCase();
  return FIELD_BY_PATH_MAP.get(clean) ?? FIELD_BY_ALIAS_MAP.get(clean);
}
