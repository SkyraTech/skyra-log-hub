# NestJS API & Dependency Injection Standards

**Document Version:** 1.0.0  
**Status:** Approved Enterprise Architecture Baseline  
**Task Reference:** LOGHUB-ARCH-001  
**Applies To:** Ingestion Gateway (`apps/ingestion-gateway`), Query Service (`apps/query-service`), and NestJS Adapters

---

## 1. Controller Architecture & HTTP Pipeline

NestJS controllers in Skyra LogHub function strictly as **HTTP dispatchers**. They validate the delivery transport, extract authenticated identity, and forward execution to application services.

```text
Incoming HTTP Request
       │
       ▼
[ Fastify Body Parser ] ─── Strict JSON parsing (rejection of duplicate keys)
       │
       ▼
[ Authentication Guard ] ─── Validates Bearer/JWT token; attaches Principal to request
       │
       ▼
[ Authorization Guard ] ──── Validates project and tenant scope permissions
       │
       ▼
[ Validation Pipe ] ──────── Validates DTO payload against authoritative JSON Schema
       │
       ▼
[ Controller Action ] ────── Calls Application Service; maps result to Response DTO
       │
       ▼
[ Response Interceptor ] ─── Measures monotonic duration; enriches response metadata
       │
       ▼
[ Exception Filter ] ─────── Catches unhandled errors; converts to RFC 7807 Problem Details
```

### Controller Rules
1. **No Business Logic:** Controllers must not calculate cryptographic digests, build file paths, or execute database queries.
2. **Explicit HTTP Codes:** Methods must declare explicit `@HttpCode(HttpStatus.OK)` or `@HttpCode(HttpStatus.CREATED)`.
3. **Identity Injection:** Controllers receive identity via the `@CurrentIdentity()` parameter decorator, never by manually inspecting raw headers.
4. **Maximum Method Length:** Controller methods must not exceed 25 lines of code.

---

## 2. Dependency Injection Lifecycle & Provider Scopes

### 2.1 Scope Guidance: Prefer Stateless Singletons
- **Default:** All NestJS providers, services, and repositories must use **`Scope.DEFAULT` (Singleton)**.
- **Stateless Operation:** Singletons must never store mutable request-specific state (such as the current tenant ID or user token) in instance properties.
- **Explicit Parameter Passing:** Context (e.g. `identity: AuthenticatedIdentity`) must be passed explicitly as method arguments through the application service call stack.
- **Why Avoid Request Scope:** In NestJS, `Scope.REQUEST` forces the DI container to instantiate a new tree of objects for every incoming HTTP request. In high-throughput services (>10,000 events/sec), request-scoped providers cause severe garbage collection pressure and throughput degradation.

### 2.2 Interface Tokens & Symbol Inversion
When binding repositories or engine adapters, use unique `Symbol` tokens:

```typescript
// Definition in domain/ports:
export const ARCHIVE_SEGMENT_REPOSITORY = Symbol('ARCHIVE_SEGMENT_REPOSITORY');

// Provider registration in module:
@Module({
  providers: [
    {
      provide: ARCHIVE_SEGMENT_REPOSITORY,
      useClass: process.env.NODE_ENV === 'production'
        ? PrismaArchiveSegmentRepository
        : InMemoryArchiveSegmentRepository,
    },
  ],
  exports: [ARCHIVE_SEGMENT_REPOSITORY],
})
export class MetadataModule {}

// Consumption in application service:
@Injectable()
export class ArchiveDiscoveryService {
  constructor(
    @Inject(ARCHIVE_SEGMENT_REPOSITORY)
    private readonly repository: IArchiveSegmentRepository,
  ) {}
}
```

---

## 3. Request Processing Components

### 3.1 Guards (`canActivate`)
- **Responsibility:** Authentication and authorization gates.
- **Execution Order:** Guards execute *before* pipes and interceptors.
- **Fail-Closed:** If authentication is missing or token verification fails, throw `UnauthorizedException` (401). If tenant/project scope is invalid, throw `ForbiddenException` (403).

### 3.2 Pipes (`transform`)
- **Responsibility:** Payload sanitization, type transformation, and schema validation.
- **Authoritative Validation:** Pipes must validate incoming bodies against versioned JSON Schemas via Ajv Draft 2020-12 (e.g. `BatchValidationPipe`, `SearchValidationPipe`).
- **Failure Handling:** Throw `UnprocessableEntityException` (422) or `BadRequestException` (400) with descriptive RFC 7807 parameter error arrays.

### 3.3 Interceptors (`intercept`)
- **Responsibility:** Post-request response transformation, execution timing, and query audit logging.
- **Non-Invasive:** Interceptors must not alter response payloads in ways that violate published OpenAPI contracts.

### 3.4 Exception Filters (`catch`)
- **Responsibility:** Catching application errors and formatting standard RFC 7807 responses.
- **Never Leak Internals:** Production exception filters must suppress SQL statements, database connection strings, local file paths, and internal stack traces.

---

## 4. Contract-First API & Swagger/OpenAPI Synchronization

Skyra LogHub mandates a **Contract-First** API lifecycle:
1. **Authoritative Contracts:** OpenAPI 3.1 contracts (`contracts/ingestion/v1/openapi.yaml`, `contracts/query/v1/openapi.yaml`) and JSON Schemas (`contracts/schemas/v1/`) are authored and reviewed first.
2. **DTO Derivation:** TypeScript DTOs and interfaces are derived from or strictly verified against the authoritative schemas.
3. **Automated Drift Detection:** CI runs `pnpm test:contracts` to verify that controllers, request DTOs, and response shapes match published OpenAPI contracts.
4. **Swagger UI:** In non-production environments (`NODE_ENV !== 'production'`), Swagger UI is served at `/docs` for interactive exploration. In production, Swagger UI is disabled by default to minimize attack surface.
