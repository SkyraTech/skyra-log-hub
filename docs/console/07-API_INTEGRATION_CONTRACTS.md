# Skyra LogHub — API Integration Contracts & Client Architecture

**Document Version:** 1.0.0  
**Status:** Approved Architecture Specification  
**Task ID:** `LOGHUB-CONSOLE-001`  
**Phase:** Phase 4 — Web Console, Administration & Observability Experience  
**Date:** 2026-10-27  

---

## 1. Authoritative Contract Derivation

All TypeScript request DTOs, response models, and validation schemas in `apps/console-web` derive directly from the versioned OpenAPI 3.1.0 specifications in `contracts/query/v1/`:

- `contracts/query/v1/openapi.yaml`
- `contracts/query/v1/search-request.schema.json`
- `contracts/query/v1/search-response.schema.json`
- `contracts/query/v1/aggregate-request.schema.json`
- `contracts/query/v1/aggregate-response.schema.json`
- `contracts/query/v1/facets-request.schema.json`
- `contracts/query/v1/facets-response.schema.json`
- `contracts/schemas/v1/log-event.schema.json`

Handwritten, drift-prone copies of API interfaces are strictly forbidden.

---

## 2. Query Service Client Interface Definitions

```typescript
/**
 * Core query API client port for the Angular Web Console.
 */
export interface IQueryApiClient {
  /**
   * Bounded server-filtered log search with keyset cursor pagination.
   */
  searchLogs(request: SearchLogsRequestDto, abortSignal?: AbortSignal): Observable<SearchLogsResponseDto>;

  /**
   * Retrieves single canonical ECS log event by UUIDv4.
   */
  getLogEventById(eventId: string, projectId: string, dateHint?: string): Observable<CanonicalLogEvent>;

  /**
   * Computes date histograms, term frequencies, or cardinality metrics.
   */
  aggregateLogs(request: AggregateLogsRequestDto, abortSignal?: AbortSignal): Observable<AggregateLogsResponseDto>;

  /**
   * Retrieves dynamic categorical facet values and frequencies.
   */
  getLogFacets(request: GetLogFacetsRequestDto, abortSignal?: AbortSignal): Observable<GetLogFacetsResponseDto>;
}
```

### 2.1 Request & Response Model Mappings

#### 1. Search API (`POST /query/v1/logs/search`)
```typescript
export interface SearchLogsRequestDto {
  time_range: {
    start: string; // ISO 8601 UTC (inclusive)
    end: string;   // ISO 8601 UTC (exclusive)
  };
  projects: string[];
  query_text?: string;
  filters?: StructuredFilterDto[];
  sort_direction?: 'desc' | 'asc';
  limit?: number; // 1 to 500, default 50
  cursor?: string; // Signed HMAC-SHA256 cursor token
}

export interface SearchLogsResponseDto {
  events: CanonicalLogEvent[];
  pagination: {
    total_returned: number;
    has_more: boolean;
    next_cursor?: string | null;
  };
  statistics?: {
    scanned_bytes: number;
    scanned_segments: number;
    execution_time_ms: number;
    archive_watermark: string;
  };
  scope?: {
    tenant_id: string;
    searched_projects: string[];
  };
}
```

#### 2. Single Event Lookup (`GET /query/v1/logs/:eventId`)
Returns the canonical `CanonicalLogEvent` object matching ECS 8.11.0:
```typescript
export interface CanonicalLogEvent {
  '@timestamp': string;
  ecs: { version: '8.11.0' };
  event: { id: string; action?: string; duration?: number };
  log: { level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' };
  message: string;
  service: { name: string; environment?: string; version?: string };
  skyra: { tenant_id: string; project_id: string; schema_version: '1.0.0' };
  trace?: { id: string };
  span?: { id: string };
  error?: { type: string; message: string; stack_trace?: string };
  http?: { request?: { method: string }; response?: { status_code: number } };
  labels?: Record<string, string>;
  custom?: Record<string, unknown>;
}
```

#### 3. Aggregations API (`POST /query/v1/logs/aggregate` via `POST /bff/query/aggregate`)
```typescript
export interface AggregateLogsRequestDto {
  time_range: { start: string; end: string };
  projects: string[];
  filters?: StructuredFilterDto[];
  aggregations: Array<{
    name: string;
    type: 'date_histogram' | 'terms' | 'cardinality';
    field?: string;
    interval?: '1m' | '5m' | '15m' | '1h' | '6h' | '1d';
    size?: number; // 1 to 50
  }>;
}

export interface AggregateLogsResponseDto {
  aggregations: Record<string, {
    type: 'date_histogram' | 'terms' | 'cardinality';
    buckets?: Array<{ key: string | number; count: number; timestamp?: string }>;
    value?: number;
  }>;
  statistics?: {
    scanned_bytes: number;
    scanned_segments: number;
    execution_time_ms: number;
    archive_watermark: string;
  };
}
```

#### 3.1 BFF Proxy & Resource Concurrency Limits
- The BFF (`POST /bff/query/aggregate`) validates session cookies and workspace project membership before minting a short-lived internal JWT with `query:aggregate` scope.
- Requests enforce the backend contract constraint of **maximum 5 aggregations per request batch**. Overview uses 4 (`volume_over_time`, `severity_distribution`, `top_services`, `active_services_count`) and Analytics uses 5 (`volume_over_time`, `severity_distribution`, `top_services`, `top_errors`, `event_actions`).
- Bounded batch execution prevents analytical stampedes on DuckDB execution threads.

#### 3.2 Secure Drilldown URL Contracts
Dashboard charts link directly into the Log Explorer (`/logs`) using query-string state:
- Severity drilldown: `?levels=error,fatal` or `?levels=<level>`
- Service drilldown: `?services=<serviceName>`
- Date histogram bucket drilldown: `?range=custom&start=<bucketStartUTC>&end=<bucketEndUTC>`
- URL parameters never leak credentials, session identifiers, or signed cursors.

#### 4. Facets API (`POST /query/v1/logs/facets`)
```typescript
export interface GetLogFacetsRequestDto {
  time_range: { start: string; end: string };
  projects: string[];
  filters?: StructuredFilterDto[];
  facet_fields: Array<'service.name' | 'log.level' | 'event.action' | 'environment' | 'error.type'>;
}

export interface GetLogFacetsResponseDto {
  facets: Record<string, Array<{ value: string; count: number }>>;
}
```

---

## 3. RFC 7807 Error Response Handling

Every non-2xx response from the Query Service is mapped to an RFC 7807 Problem Details object:
```typescript
export interface ProblemDetailsDto {
  type: string;     // URI reference identifying problem type
  title: string;    // Short, human-readable summary
  status: number;   // HTTP status code
  detail: string;   // Human-readable explanation specific to this occurrence
  instance?: string;// URI reference identifying specific request occurrence
}
```

### 3.1 Status Code Mapping Table
- **400 Bad Request:** Form validation error, inverted time range, or malformed JSON.
- **401 Unauthorized:** Missing or expired session; triggers redirect to `/login`.
- **403 Forbidden:** Access denied to requested project; displays project permission banner.
- **404 Not Found:** Event ID not found within authorized project scope.
- **422 Unprocessable:** Invalid filter operator or unallowlisted field path.
- **429 Too Many Requests:** Per-tenant concurrency slot ceiling reached; displays cooldown banner.
- **504 Gateway Timeout:** Query execution exceeded server budget; prompts user to narrow time range.

---

## 4. Request Cancellation & Timeout Policies

1. **Search Request Timeout:** Capped at **10,000 ms**.
2. **Analytics Request Timeout:** Capped at **15,000 ms**.
3. **In-Flight Cancellation:** Navigating away from Log Explorer or typing a new search filter cancels pending HTTP requests via `AbortController`, which in turn triggers DuckDB's native `conn.interrupt()` on the backend to immediately free worker threads.
4. **Retry Policy:** Automatic retries are **disabled** for all 4xx/5xx responses to avoid worsening backend overload during incidents. Retries are permitted only on transient network drops (status code 0).
