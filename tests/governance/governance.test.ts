import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runGovernanceAudit } from '../../scripts/verify-design-system-governance.cjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Design System Governance & Brand Integrity Auditor (PLATFORM-LOGHUB-003)', () => {
  it('should pass all 6 governance gates on the active codebase', () => {
    const result = runGovernanceAudit({ silent: true, returnResult: true });
    assert.equal(result.passed, true, 'Governance audit should pass with 0 violations');
    assert.equal(result.violations, 0, 'Zero violations expected');
    assert.equal(result.details.gate1Fails, 0, 'Gate 1 (Hexes) must pass');
    assert.equal(result.details.gate2Fails, 0, 'Gate 2 (Private Imports) must pass');
    assert.equal(result.details.gate3Fails, 0, 'Gate 3 (Archive Integrity) must pass');
    assert.equal(result.details.gate4Fails, 0, 'Gate 4 (Dependency Resolution) must pass');
    assert.equal(result.details.gate5Fails, 0, 'Gate 5 (WC Registration) must pass');
    assert.equal(result.details.gate6Fails, 0, 'Gate 6 (Duplicate Primitives) must pass');
  });

  it('should verify all 31 package archives exist in the artifacts directory', () => {
    const artifactsDir = path.resolve(__dirname, '../../artifacts/platform-packages');
    const manifestPath = path.join(artifactsDir, 'PACKAGES_MANIFEST.json');
    assert.equal(fs.existsSync(manifestPath), true, 'PACKAGES_MANIFEST.json must exist');

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.equal(manifest.packages.length, 31, 'Exactly 31 packages must be declared in manifest');

    for (const pkg of manifest.packages) {
      const archivePath = path.join(artifactsDir, pkg.archive);
      assert.equal(fs.existsSync(archivePath), true, `Archive ${pkg.archive} must exist on disk`);
      const stat = fs.statSync(archivePath);
      assert.ok(stat.size > 0, `Archive ${pkg.archive} must have non-zero file size`);
    }
  });

  it('should confirm all 20 platform dependencies in console-web point to local archives', () => {
    const pkgPath = path.resolve(__dirname, '../../apps/console-web/package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const platformDeps = Object.entries(pkg.dependencies).filter(([k]) =>
      k.startsWith('@skyra-tech-platform/')
    );

    assert.equal(platformDeps.length, 20, 'Exactly 20 platform packages must be installed in console-web');
    for (const [name, target] of platformDeps) {
      assert.ok(
        (target as string).startsWith('file:../../artifacts/platform-packages/'),
        `${name} must resolve from local artifacts directory: got ${target}`
      );
    }
  });
});
