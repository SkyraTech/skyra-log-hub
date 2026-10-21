/**
 * Skyra Logging Canonical Schema Types
 * Version: 1.0.0
 * Aligned with Elastic Common Schema (ECS) 8.11.0 and Skyra LogHub ADR-011.
 */

export type CanonicalEnvironment = 'local' | 'development' | 'test' | 'staging' | 'production';
export type LegacyEnvironment = 'dev' | 'qa';
export type Environment = CanonicalEnvironment | LegacyEnvironment;

export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

export type EventOutcome = 'success' | 'failure' | 'unknown';

/**
 * Normalizes legacy environment aliases to canonical names.
 * 'dev' -> 'development', 'qa' -> 'test'.
 */
export function normalizeEnvironment(env: string): CanonicalEnvironment {
  const lower = env.trim().toLowerCase();
  if (lower === 'dev') return 'development';
  if (lower === 'qa') return 'test';
  if (['local', 'development', 'test', 'staging', 'production'].includes(lower)) {
    return lower as CanonicalEnvironment;
  }
  return lower as CanonicalEnvironment;
}

/**
 * Normalizes historical underscore action names to canonical dot-notation.
 */
export function normalizeEventAction(action: string): string {
  const trimmed = action.trim();
  const mapping: Record<string, string> = {
    'http_request': 'http.request.completed',
    'sql_query': 'database.query.completed',
    'batch_job': 'job.execution.completed',
    'user_checkout': 'business.checkout.completed',
    'ml_pipeline_step': 'process.pipeline.completed',
  };
  return mapping[trimmed] ?? trimmed;
}

export interface EcsEvent {
  id: string;
  action?: string;
  dataset?: string;
  category?: string[];
  type?: string[];
  outcome?: EventOutcome;
  duration?: number; // nanoseconds
}

export interface EcsLog {
  level: LogLevel;
  logger?: string;
}

export interface EcsService {
  name: string;
  version?: string;
  environment: Environment;
  node?: {
    name?: string;
  };
}

export interface EcsHost {
  hostname?: string;
  name?: string;
  ip?: string[];
  id?: string;
}

export interface EcsTrace {
  id: string;
}

export interface EcsSpan {
  id: string;
}

export interface EcsHttpRequest {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS' | 'CONNECT' | 'TRACE' | string;
  id?: string;
}

export interface EcsHttpResponse {
  status_code: number;
  bytes?: number;
}

export interface EcsHttp {
  request?: EcsHttpRequest;
  response?: EcsHttpResponse;
  route?: string;
}

export interface EcsUrl {
  path?: string;
  query?: string;
  domain?: string;
  port?: number;
}

export interface EcsClient {
  ip?: string;
  port?: number;
}

export interface EcsUserAgent {
  original?: string;
}

export interface EcsUser {
  id?: string;
  name?: string;
  email?: string;
  roles?: string[];
}

export interface EcsDatabase {
  system?: 'postgresql' | 'mysql' | 'sqlite' | 'duckdb' | 'valkey' | 'redis' | 'elasticsearch' | 'mongodb' | 'oracle' | 'sqlserver' | string;
  name?: string;
  operation?: string;
  table?: string;
  statement_sanitized?: string;
  rows_affected?: number;
}

export interface EcsError {
  type: string;
  message: string;
  code?: string | number;
  stack_trace?: string;
}

export interface EcsJob {
  name: string;
  id?: string;
  queue?: string;
  attempt?: number;
  max_attempts?: number;
}

export interface SkyraHttpMetadata {
  route_template?: string;
}

export interface SkyraDbMetadata {
  query_fingerprint?: string;
  client_duration_ms?: number;
}

export interface SkyraJobMetadata {
  id?: string;
  type?: string;
  status?: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  queue_duration_ms?: number;
  attempt?: number;
}

export interface SkyraAuditMetadata {
  actor_id?: string;
  action?: string;
  resource_type?: string;
  resource_id?: string;
}

export interface SkyraSecurityMetadata {
  audit?: boolean;
  event_type?: string;
  subject_id?: string;
  decision?: 'allow' | 'deny';
  auth_mechanism?: string;
  client_ip?: string;
  [key: string]: unknown;
}

export interface SkyraMetadata {
  project_id: string;
  schema_version: string;
  component?: string;
  duration_ms?: number; // milliseconds
  http?: SkyraHttpMetadata;
  db?: SkyraDbMetadata;
  job?: SkyraJobMetadata;
  audit?: SkyraAuditMetadata;
  security?: SkyraSecurityMetadata;
  business?: Record<string, unknown>;
}

/**
 * Top-level Canonical Skyra Log Event
 */
export interface SkyraLogEvent {
  '@timestamp': string; // ISO 8601 UTC
  'ecs.version': string;
  event: EcsEvent;
  log: EcsLog;
  message: string;
  service: EcsService;
  skyra: SkyraMetadata;
  host?: EcsHost;
  trace?: EcsTrace;
  span?: EcsSpan;
  http?: EcsHttp;
  url?: EcsUrl;
  client?: EcsClient;
  user_agent?: EcsUserAgent;
  user?: EcsUser;
  database?: EcsDatabase;
  error?: EcsError;
  job?: EcsJob;
  labels?: Record<string, string>;
  tags?: string[];
}

export interface ValidationErrorDetail {
  path: string;
  message: string;
  received?: unknown;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationErrorDetail[];
}
