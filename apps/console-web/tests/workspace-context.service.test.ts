import '@angular/compiler';
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createEnvironmentInjector, EnvironmentInjector, Injector } from '@angular/core';
import { WorkspaceContextService } from '../src/app/core/workspace/workspace-context.service';
import { AppConfigService } from '../src/app/core/config/app-config.service';

describe('WorkspaceContextService — Multi-tenant Workspace Context & Time Retention', () => {
  let injector: EnvironmentInjector;
  let service: WorkspaceContextService;

  beforeEach(() => {
    const config = new AppConfigService();
    config.updateConfig({
      previewMode: true,
      previewIsolation: true,
      environment: 'development',
      previewWorkspace: {
        tenant: {
          id: '00000000-0000-0000-0000-000000000001',
          code: 'skyra-internal',
          name: 'Skyra Technologies'
        },
        project: { id: 'skyra-tech', name: 'Skyra Platform Core', status: 'ACTIVE' },
        projects: [
          { id: 'skyra-tech', name: 'Skyra Platform Core', status: 'ACTIVE' },
          { id: 'auth-service', name: 'Identity & Authentication', status: 'ACTIVE' },
          { id: 'billing-api', name: 'Billing & Subscriptions', status: 'ACTIVE' }
        ]
      }
    });
    injector = createEnvironmentInjector(
      [{ provide: AppConfigService, useValue: config }, WorkspaceContextService],
      Injector.NULL as unknown as EnvironmentInjector
    );
    service = injector.get(WorkspaceContextService);
  });

  it('starts unauthenticated without tenant context when unconfigured', () => {
    const unconfigured = new WorkspaceContextService();
    assert.equal(unconfigured.hasActiveTenant(), false);
    assert.equal(unconfigured.activeTenant(), null);
    assert.deepEqual(unconfigured.selectedProjectIds(), []);
  });

  it('should initialize with default Skyra internal tenant context and production environment in preview mode', () => {
    assert.equal(service.hasActiveTenant(), true);
    assert.equal(service.activeTenant()?.code, 'skyra-internal');
    assert.equal(service.selectedEnvironment(), 'production');
    assert.deepEqual(service.selectedProjectIds(), ['skyra-tech']);
    assert.deepEqual(service.currentContext(), {
      tenantId: 'skyra-internal',
      projectId: 'skyra-tech',
      environment: 'production',
    });
  });

  it('should calculate accurate time ranges for presets', () => {
    service.setTimeRangePreset('15m');
    const range15m = service.timeRange();
    assert.equal(range15m.preset, '15m');
    const delta15m = new Date(range15m.endIso).getTime() - new Date(range15m.startIso).getTime();
    assert.ok(Math.abs(delta15m - 15 * 60 * 1000) < 1000);

    service.setTimeRangePreset('24h');
    const range24h = service.timeRange();
    assert.equal(range24h.preset, '24h');
    const delta24h = new Date(range24h.endIso).getTime() - new Date(range24h.startIso).getTime();
    assert.ok(Math.abs(delta24h - 24 * 60 * 60 * 1000) < 1000);

    service.setTimeRangePreset('30d');
    const range30d = service.timeRange();
    assert.equal(range30d.preset, '30d');
    const delta30d = new Date(range30d.endIso).getTime() - new Date(range30d.startIso).getTime();
    assert.ok(Math.abs(delta30d - 30 * 24 * 60 * 60 * 1000) < 1000);
  });

  it('should support custom time ranges without exceeding boundaries', () => {
    const start = '2026-10-01T00:00:00.000Z';
    const end = '2026-10-02T00:00:00.000Z';
    service.setCustomTimeRange(start, end);

    const range = service.timeRange();
    assert.equal(range.preset, 'custom');
    assert.equal(range.startIso, start);
    assert.equal(range.endIso, end);
  });

  it('should update active tenant and projects reactively', () => {
    service.selectTenant({
      id: 'tenant-999',
      code: 'acme-corp',
      name: 'Acme Corporation',
    });
    service.selectProjects(['auth-service']);
    service.selectEnvironment('staging');

    assert.equal(service.activeTenant()?.code, 'acme-corp');
    assert.deepEqual(service.selectedProjectNames(), ['Identity & Authentication']);
    assert.deepEqual(service.currentContext(), {
      tenantId: 'acme-corp',
      projectId: 'auth-service',
      environment: 'staging',
    });
  });
});
