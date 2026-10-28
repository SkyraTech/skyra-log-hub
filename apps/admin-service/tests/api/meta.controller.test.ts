import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { MetaController } from '../../src/api/controllers/meta.controller.js';
import { AdminConfigService } from '../../src/core/config/admin-config.service.js';

describe('MetaController API Suite', () => {
  const config = new AdminConfigService({
    ADMIN_PERSISTENCE_ENABLED: 'false',
    TRUSTED_OIDC_ISSUERS: 'https://auth.skyra.internal',
  });
  const controller = new MetaController(config);

  it('GET /health/liveness returns UP status', () => {
    const res = controller.getLiveness();
    assert.strictEqual(res.status, 'UP');
    assert.strictEqual(res.service, 'skyra-admin-service');
  });

  it('GET /health/readiness reflects Gate A staged status', () => {
    const res = controller.getReadiness();
    assert.strictEqual(res.status, 'UP');
    assert.strictEqual(res.persistenceReady, false);
    assert.strictEqual(res.gateMode, 'GATE_A_STAGED');
  });

  it('GET /admin/v1/meta returns supported roles, capabilities, and version info', () => {
    const res = controller.getMetadata();
    assert.strictEqual(res.service, 'skyra-admin-service');
    assert.strictEqual(res.apiContractVersion, '3.1.0');
    assert.strictEqual(res.persistenceMode, 'IN_MEMORY_STAGED');
    assert.ok(res.supportedRoles.includes('OrgOwner'));
    assert.ok(res.supportedRoles.includes('OrgAdmin'));
    assert.ok(res.supportedCapabilities.includes('tenant.members.manage'));
    assert.ok(res.supportedCapabilities.includes('quotas.manage'));
  });
});
