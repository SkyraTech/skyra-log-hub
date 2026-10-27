import '@angular/compiler';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WorkspaceContextService } from '../src/app/core/workspace/workspace-context.service';

describe('WorkspaceContextService — Multi-tenant Workspace Context & Time Retention', () => {
  it('should initialize with default Skyra internal tenant context and production environment', () => {
    const service = new WorkspaceContextService();
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
    const service = new WorkspaceContextService();

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
    const service = new WorkspaceContextService();
    const start = '2026-10-01T00:00:00.000Z';
    const end = '2026-10-02T00:00:00.000Z';
    service.setCustomTimeRange(start, end);

    const range = service.timeRange();
    assert.equal(range.preset, 'custom');
    assert.equal(range.startIso, start);
    assert.equal(range.endIso, end);
  });

  it('should update active tenant and projects reactively', () => {
    const service = new WorkspaceContextService();
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
