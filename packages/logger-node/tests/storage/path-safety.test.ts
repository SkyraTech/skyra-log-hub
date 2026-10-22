import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import {
  resolveSafeLogDirectory,
  validateProjectId,
  validateServiceName,
  validateInstanceId,
  validateEnvironment,
  PathSafetyError,
} from '../../dist/internal/path-safety.js';

describe('Storage & Path Safety (contracts/storage-contract.md)', () => {
  it('1. Constructs deterministic path hierarchy conforming to contract', () => {
    const root = path.resolve('./test-logs');
    const result = resolveSafeLogDirectory(
      root,
      'skyra-erp',
      'production',
      'erp-api',
      'instance-01'
    );

    const expected = path.resolve(root, 'skyra-erp', 'production', 'erp-api', 'instance-01');
    assert.equal(result, expected);
  });

  it('2. Rejects path traversal attempts in instanceId', () => {
    const traversalAttempts = [
      '../escape',
      '../../var/log',
      '..\\windows\\system32',
      'instance/nested',
      'instance\\sub',
      'inst\0nullbyte',
      '..',
      './inst',
    ];

    for (const attempt of traversalAttempts) {
      assert.throws(
        () => validateInstanceId(attempt),
        PathSafetyError,
        `Expected rejection of instanceId traversal attempt '${attempt}'`
      );
    }
  });

  it('3. Rejects illegal characters, spaces, and uppercase in projectId', () => {
    const badProjects = [
      'SkyraERP',
      'skyra erp',
      'skyra/erp',
      'skyra_erp',
      '-start-dash',
      'end-dash-',
      'a'.repeat(65),
      '',
    ];

    for (const bad of badProjects) {
      assert.throws(
        () => validateProjectId(bad),
        PathSafetyError,
        `Expected rejection of projectId '${bad}'`
      );
    }
  });

  it('4. Rejects illegal characters and uppercase in serviceName', () => {
    const badServices = [
      'ERP_Service',
      'erp service',
      'erp/api',
      'erp..api',
      'a'.repeat(65),
      '',
    ];

    for (const bad of badServices) {
      assert.throws(
        () => validateServiceName(bad),
        PathSafetyError,
        `Expected rejection of serviceName '${bad}'`
      );
    }
  });

  it('5. Validates environment against canonical and legacy list', () => {
    assert.doesNotThrow(() => validateEnvironment('production'));
    assert.doesNotThrow(() => validateEnvironment('staging'));
    assert.doesNotThrow(() => validateEnvironment('development'));
    assert.doesNotThrow(() => validateEnvironment('test'));
    assert.doesNotThrow(() => validateEnvironment('local'));
    assert.doesNotThrow(() => validateEnvironment('dev'));
    assert.doesNotThrow(() => validateEnvironment('qa'));

    assert.throws(() => validateEnvironment('prod'), PathSafetyError);
    assert.throws(() => validateEnvironment('invalid-env'), PathSafetyError);
  });
});
