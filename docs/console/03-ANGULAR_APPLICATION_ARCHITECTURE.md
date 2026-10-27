# Skyra LogHub — Angular Web Console Architecture & Engineering Standards

**Document Version:** 1.0.0  
**Status:** Approved Architecture Specification  
**Task ID:** `LOGHUB-CONSOLE-001`  
**Phase:** Phase 4 — Web Console, Administration & Observability Experience  
**Date:** 2026-10-27  

---

## 1. Technology Baseline & Platform Alignment

The Skyra LogHub Web Console is built in `apps/console-web` leveraging the current Angular technology baseline:

- **Framework:** Angular 19 (Standalone Components by default, zero `NgModule` clutter).
- **Language:** TypeScript 5.7+ running under strict mode (`strict: true`, `noUncheckedIndexedAccess: true`).
- **Runtime Environment:** Node.js v24.21.0 LTS.
- **Package Manager:** pnpm 10+ (coordinated within the root `pnpm-workspace.yaml`).
- **Build & Bundler:** Angular Application Builder (`@angular-devkit/build-angular:application` powered by Vite / esbuild).
- **Styling Pipeline:** Vanilla CSS with Token-Driven Custom Properties (no external Tailwind dependencies).

---

## 2. Core Architectural Principles & Clean Layering

The application strictly implements **Clean Architecture** and **SOLID** principles, ensuring presentation logic is isolated from HTTP and persistence adapters:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                            PRESENTATION LAYER                               │
│  Smart Feature Views (e.g. LogExplorerComponent) & Dumb Shared UI (Badge)   │
│  • ChangeDetectionStrategy.OnPush 100%                                      │
│  • Modern Control Flow: @if, @for, @switch, @defer                         │
│  • Signal Inputs / Outputs: input.required<T>(), output<T>()                │
├─────────────────────────────────────────────────────────────────────────────┤
│                         FACADE / STATE LAYER                                │
│  Feature Facades (e.g. LogExplorerFacadeService)                            │
│  • Reactive Signal State: signal<T>(), computed<T>()                        │
│  • Manages pagination cursors, debounced filters, and loading states        │
├─────────────────────────────────────────────────────────────────────────────┤
│                       DOMAIN CONTRACTS & MODELS                             │
│  Strongly Typed Entities & DTOs (from contracts/query/v1/)                  │
│  • Canonical ECS LogEvent, KeysetCursor, SearchRequest, AggregateResponse   │
├─────────────────────────────────────────────────────────────────────────────┤
│                    INFRASTRUCTURE & API ADAPTERS                            │
│  Typed HTTP Clients & Functional Interceptors                               │
│  • QueryServiceClientAdapter (implements IQueryApiPort)                     │
│  • AuthInterceptorFn (Bearer JWT injection & session refresh)               │
│  • ErrorInterceptorFn (RFC 7807 Problem Details mapping)                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Separation of Concerns Rules
1. **Dumb UI Components** (`shared/ui/`) must have zero direct service injections. They communicate exclusively through Signal `input()` and `output()` events.
2. **Feature Views** (`features/`) inject their respective Feature Facade (e.g., `LogExplorerFacade`), avoiding raw `HttpClient` calls in UI controllers.
3. **HTTP Clients** (`core/api/`) implement domain ports. If the backend changes its transport or endpoint naming, only the adapter is updated.

---

## 3. Modern Angular 19 Paradigms

### 3.1 Standalone Components & Dependency Injection
All components, directives, and pipes are standalone:
```typescript
@Component({
  selector: 'skyra-log-table',
  standalone: true,
  imports: [CommonModule, SeverityBadgeComponent, JsonViewerComponent],
  templateUrl: './log-table.component.html',
  styleUrls: ['./log-table.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LogTableComponent {
  // Signal Inputs
  readonly events = input.required<ReadonlyArray<CanonicalLogEvent>>();
  readonly isLoading = input<boolean>(false);

  // Signal Output
  readonly eventSelected = output<CanonicalLogEvent>();
}
```

### 3.2 Signal-Based Reactive State Management
Component and facade state uses Angular Signals, eliminating unnecessary RxJS subscription boilerplate while maintaining microsecond-level change detection precision:
```typescript
@Injectable({ providedIn: 'root' })
export class LogExplorerFacade {
  private readonly queryService = inject(QueryApiService);

  // Internal Writable Signals
  private readonly _events = signal<CanonicalLogEvent[]>([]);
  private readonly _isLoading = signal<boolean>(false);
  private readonly _cursorHistory = signal<string[]>([]);
  private readonly _error = signal<ProblemDetails | null>(null);

  // Public Readonly Signals
  readonly events = this._events.asReadonly();
  readonly isLoading = this._isLoading.asReadonly();
  readonly error = this._error.asReadonly();

  // Computed Signal
  readonly hasEvents = computed(() => this._events().length > 0);
  readonly canGoBack = computed(() => this._cursorHistory().length > 1);
}
```

### 3.3 Modern Template Control Flow
Templates use modern control flow with mandatory tracking keys for list rendering:
```html
@if (isLoading()) {
  <skyra-table-skeleton [rows]="10" />
} @else if (error()) {
  <skyra-error-banner [error]="error()!" (retry)="reload()" />
} @else if (events().length === 0) {
  <skyra-empty-state 
    title="No events found" 
    message="Try adjusting your time range or structured filters." 
  />
} @else {
  <table class="skyra-log-table">
    <thead>
      <tr>
        <th>Timestamp</th>
        <th>Severity</th>
        <th>Service</th>
        <th>Message</th>
      </tr>
    </thead>
    <tbody>
      @for (evt of events(); track evt.event.id) {
        <tr (click)="selectEvent(evt)">
          <td>{{ evt['@timestamp'] | date:'yyyy-MM-dd HH:mm:ss.SSS' }}</td>
          <td><skyra-severity-badge [level]="evt.log.level" /></td>
          <td>{{ evt.service.name }}</td>
          <td class="message-cell">{{ evt.message }}</td>
        </tr>
      }
    </tbody>
  </table>
}
```

---

## 4. Proposed Application Structure

```text
apps/console-web/
├── src/
│   ├── app/
│   │   ├── core/                           # Singleton core services
│   │   │   ├── api/                        # Typed API clients & DTOs
│   │   │   │   ├── query-api.service.ts
│   │   │   │   ├── admin-api.service.ts
│   │   │   │   └── models/                 # OpenAPI contract types
│   │   │   ├── auth/                       # Authentication & session
│   │   │   │   ├── auth.service.ts
│   │   │   │   ├── auth.interceptor.ts
│   │   │   │   └── auth.guard.ts
│   │   │   ├── config/                     # Environment configuration
│   │   │   │   └── app-config.service.ts
│   │   │   └── errors/                     # Global error handling
│   │   │       ├── global-error-handler.ts
│   │   │       └── problem-details.model.ts
│   │   │
│   │   ├── layout/                         # Structural UI frame
│   │   │   ├── app-shell/                  # Main container
│   │   │   ├── sidebar/                    # Collapsible navigation
│   │   │   ├── topbar/                     # Global context & user profile
│   │   │   └── breadcrumbs/                # Navigation breadcrumbs
│   │   │
│   │   ├── shared/                         # Reusable presentation controls
│   │   │   ├── ui/
│   │   │   │   ├── button/
│   │   │   │   ├── badge/
│   │   │   │   ├── table/
│   │   │   │   ├── drawer/
│   │   │   │   ├── json-viewer/
│   │   │   │   ├── time-picker/
│   │   │   │   └── skeleton/
│   │   │   ├── pipes/                      # Formatters (timestamp, bytes)
│   │   │   └── directives/                 # Click-outside, tooltip
│   │   │
│   │   ├── features/                       # Lazy-loaded business modules
│   │   │   ├── overview/                   # Overview KPI dashboard
│   │   │   ├── log-explorer/               # Search, filters, event drawer
│   │   │   ├── analytics/                  # Histograms & dynamic facets
│   │   │   ├── projects/                   # Project admin & quotas
│   │   │   ├── ingestion/                  # Credentials & shipper tokens
│   │   │   ├── team/                       # Member RBAC management
│   │   │   └── settings/                   # Workspace & theme settings
│   │   │
│   │   ├── app.config.ts                   # Application configuration & providers
│   │   └── app.routes.ts                   # Root lazy-loaded routes
│   │
│   ├── assets/                             # Logos, branding icons
│   ├── styles/                             # Design token CSS files
│   │   ├── _tokens.css                     # Semantic CSS custom properties
│   │   ├── _typography.css                 # Inter font & hierarchy
│   │   ├── _themes.light.css               # Light mode overrides
│   │   ├── _themes.dark.css                # Dark mode overrides
│   │   └── styles.css                      # Global resets & entry
│   │
│   ├── index.html
│   └── main.ts
│
├── public/
├── tsconfig.app.json
├── tsconfig.spec.json
└── package.json
```

---

## 5. Functional HTTP Interceptors

Two functional interceptors govern all outbound HTTP traffic:

1. **`authInterceptorFn`:**
   - Injects `Authorization: Bearer <token>` into outgoing requests to Query Service endpoints.
   - Attaches `X-Request-ID` UUIDv4 correlation header for distributed trace linking.
   - Automatically halts requests when token is expired and redirects to `/login`.
2. **`errorInterceptorFn`:**
   - Catches HTTP error responses and deserializes RFC 7807 Problem Details (`type`, `title`, `status`, `detail`, `instance`).
   - Converts HTTP 429 (`QueryBudgetExceededException`) into an observable rate-limit banner.
   - Converts HTTP 403 into a tenant/project access-denied state with navigation recovery.
