import { Injectable, signal, computed, inject, type OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { TenantSummary, ProjectSummary, TimeRangeBoundary, TimeRangePreset } from './workspace.models';
import { AppConfigService } from '../config/app-config.service';
import { AuthService } from '../auth/auth.service';

export interface BffWorkspaceResponse {
  tenants: Array<{
    tenantId: string;
    tenantName: string;
    projects: Array<{
      projectId: string;
      projectName: string;
      roles: string[];
      allowedEnvironments?: string[];
    }>;
  }>;
  activeTenantId?: string;
  activeProjectId?: string;
}

@Injectable({
  providedIn: 'root'
})
export class WorkspaceContextService implements OnDestroy {
  private http: HttpClient | null = null;
  private configService: AppConfigService | null = null;
  private authService: AuthService | null = null;

  private readonly _activeTenant = signal<TenantSummary | null>({
    id: '00000000-0000-0000-0000-000000000001',
    code: 'skyra-internal',
    name: 'Skyra Technologies'
  });

  private readonly _availableTenants = signal<TenantSummary[]>([
    {
      id: '00000000-0000-0000-0000-000000000001',
      code: 'skyra-internal',
      name: 'Skyra Technologies'
    },
    {
      id: '00000000-0000-0000-0000-000000000002',
      code: 'partner-demo',
      name: 'Partner Demonstration Tenant'
    }
  ]);

  private readonly _availableProjects = signal<ProjectSummary[]>([
    { id: 'skyra-tech', name: 'Skyra Platform Core', status: 'ACTIVE' },
    { id: 'auth-service', name: 'Identity & Authentication', status: 'ACTIVE' },
    { id: 'billing-api', name: 'Billing & Subscriptions', status: 'ACTIVE' }
  ]);

  private readonly _selectedProjectIds = signal<string[]>(['skyra-tech']);
  private readonly _selectedEnvironment = signal<string>('production');

  private readonly _timeRange = signal<TimeRangeBoundary>(
    this.calculateTimeRange('1h')
  );

  private broadcastChannel: BroadcastChannel | null = null;

  constructor() {
    try {
      this.http = inject(HttpClient, { optional: true });
      this.configService = inject(AppConfigService, { optional: true });
      this.authService = inject(AuthService, { optional: true });
    } catch {
      // In direct non-DI unit tests
    }
    this.initBroadcastChannel();
  }

  public ngOnDestroy(): void {
    if (this.broadcastChannel) {
      this.broadcastChannel.close();
      this.broadcastChannel = null;
    }
  }

  private initBroadcastChannel(): void {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.broadcastChannel = new BroadcastChannel('skyra-auth-channel');
        this.broadcastChannel.addEventListener('message', (event) => {
          if (event.data?.type === 'WORKSPACE_SWITCHED') {
            void this.loadWorkspacesFromBff();
          }
        });
      } catch {
        // Silently catch
      }
    }
  }

  readonly activeTenant = this._activeTenant.asReadonly();
  readonly availableTenants = this._availableTenants.asReadonly();
  readonly availableProjects = this._availableProjects.asReadonly();
  readonly selectedProjectIds = this._selectedProjectIds.asReadonly();
  readonly selectedEnvironment = this._selectedEnvironment.asReadonly();
  readonly timeRange = this._timeRange.asReadonly();

  readonly hasActiveTenant = computed(() => this._activeTenant() !== null);
  readonly currentContext = computed(() => ({
    tenantId: this._activeTenant()?.code ?? 'default-tenant',
    projectId: this._selectedProjectIds()[0] ?? 'default-project',
    environment: this._selectedEnvironment(),
  }));
  readonly selectedProjectNames = computed(() => {
    const ids = this._selectedProjectIds();
    return this._availableProjects()
      .filter(p => ids.includes(p.id))
      .map(p => p.name);
  });

  public selectTenant(tenant: TenantSummary): void {
    this._activeTenant.set(tenant);
  }

  public selectProjects(projectIds: string[]): void {
    this._selectedProjectIds.set(projectIds);
  }

  public selectEnvironment(env: string): void {
    this._selectedEnvironment.set(env);
  }

  public setTimeRangePreset(preset: TimeRangePreset): void {
    this._timeRange.set(this.calculateTimeRange(preset));
  }

  public setCustomTimeRange(startIso: string, endIso: string): void {
    this._timeRange.set({
      preset: 'custom',
      startIso,
      endIso
    });
  }

  /**
   * Switches active workspace on the BFF and clears local sensitive state.
   */
  public async switchWorkspace(tenantId: string, projectId: string): Promise<boolean> {
    const bffUrl = this.configService?.config().adminApiBaseUrl || 'http://127.0.0.1:3200';
    const csrf = this.authService?.csrfToken() || '';

    // Clear sensitive previous-workspace data and reset in-flight state
    this._selectedProjectIds.set([projectId]);

    const matchingTenant = this._availableTenants().find((t) => t.code === tenantId || t.id === tenantId);
    if (matchingTenant) {
      this._activeTenant.set(matchingTenant);
    }

    if (this.http) {
      try {
        await this.http.post(
          `${bffUrl}/bff/workspaces/select`,
          { tenantId, projectId },
          {
            withCredentials: true,
            headers: csrf ? { 'X-CSRF-Token': csrf } : {},
          },
        ).toPromise();

        // Notify other tabs
        if (this.broadcastChannel) {
          this.broadcastChannel.postMessage({
            type: 'WORKSPACE_SWITCHED',
            tenantId,
            projectId,
            timestamp: Date.now(),
          });
        }

        return true;
      } catch {
        // Handle error gracefully
      }
    }

    return false;
  }

  public async loadWorkspacesFromBff(): Promise<void> {
    const bffUrl = this.configService?.config().adminApiBaseUrl || 'http://127.0.0.1:3200';
    if (!this.http) return;

    try {
      const data = await this.http.get<BffWorkspaceResponse>(`${bffUrl}/bff/workspaces`, {
        withCredentials: true,
      }).toPromise();

      if (data && data.tenants) {
        const tenants: TenantSummary[] = data.tenants.map((t) => ({
          id: t.tenantId,
          code: t.tenantId,
          name: t.tenantName,
        }));
        this._availableTenants.set(tenants);

        const currentTenant = data.tenants.find((t) => t.tenantId === data.activeTenantId) ?? data.tenants[0];
        if (currentTenant) {
          this._activeTenant.set({
            id: currentTenant.tenantId,
            code: currentTenant.tenantId,
            name: currentTenant.tenantName,
          });

          const projects: ProjectSummary[] = currentTenant.projects.map((p) => ({
            id: p.projectId,
            name: p.projectName,
            status: 'ACTIVE',
          }));
          this._availableProjects.set(projects);

          if (data.activeProjectId) {
            this._selectedProjectIds.set([data.activeProjectId]);
          } else if (projects[0]) {
            this._selectedProjectIds.set([projects[0].id]);
          }
        }
      }
    } catch {
      // Retain default or dev preview workspaces
    }
  }

  private calculateTimeRange(preset: TimeRangePreset): TimeRangeBoundary {
    const now = new Date();
    const endIso = now.toISOString();
    let startMs = now.getTime();

    switch (preset) {
      case '15m': startMs -= 15 * 60 * 1000; break;
      case '1h':  startMs -= 60 * 60 * 1000; break;
      case '4h':  startMs -= 4 * 60 * 60 * 1000; break;
      case '24h': startMs -= 24 * 60 * 60 * 1000; break;
      case '7d':  startMs -= 7 * 24 * 60 * 60 * 1000; break;
      case '30d': startMs -= 30 * 24 * 60 * 60 * 1000; break;
      default:    startMs -= 60 * 60 * 1000; break;
    }

    return {
      preset,
      startIso: new Date(startMs).toISOString(),
      endIso
    };
  }
}
