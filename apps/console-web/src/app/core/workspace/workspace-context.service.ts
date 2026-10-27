import { Injectable, signal, computed } from '@angular/core';
import { TenantSummary, ProjectSummary, TimeRangeBoundary, TimeRangePreset } from './workspace.models';

@Injectable({
  providedIn: 'root'
})
export class WorkspaceContextService {
  private readonly _activeTenant = signal<TenantSummary | null>({
    id: '00000000-0000-0000-0000-000000000001',
    code: 'skyra-internal',
    name: 'Skyra Technologies'
  });

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

  readonly activeTenant = this._activeTenant.asReadonly();
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

  selectTenant(tenant: TenantSummary): void {
    this._activeTenant.set(tenant);
  }

  selectProjects(projectIds: string[]): void {
    this._selectedProjectIds.set(projectIds);
  }

  selectEnvironment(env: string): void {
    this._selectedEnvironment.set(env);
  }

  setTimeRangePreset(preset: TimeRangePreset): void {
    this._timeRange.set(this.calculateTimeRange(preset));
  }

  setCustomTimeRange(startIso: string, endIso: string): void {
    this._timeRange.set({
      preset: 'custom',
      startIso,
      endIso
    });
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
