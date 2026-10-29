/**
 * scripts/verify-design-system-governance.cjs
 *
 * Automated Design System Governance & Brand Integrity Auditor
 * Milestones: PLATFORM-LOGHUB-002 & PLATFORM-LOGHUB-003
 *
 * Audits the codebase against 6 mandatory design system governance gates:
 * Gate 1: No unauthorized hardcoded brand hex colors (enforces official --skyra-* tokens)
 * Gate 2: No private package source imports (enforces public exports)
 * Gate 3: Integrity of local platform package archives & manifests (SHA-256)
 * Gate 4: Complete package dependency resolution (all 20 platform packages)
 * Gate 5: Web Components custom element registration coverage in main.ts
 * Gate 6: Zero unauthorized duplicate shared primitives
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LOGHUB_ROOT = path.resolve(__dirname, '..');
const CONSOLE_WEB_SRC = path.join(LOGHUB_ROOT, 'apps', 'console-web', 'src');
const ARTIFACTS_DIR = path.join(LOGHUB_ROOT, 'artifacts', 'platform-packages');
const MANIFEST_PATH = path.join(ARTIFACTS_DIR, 'PACKAGES_MANIFEST.json');
const CONSOLE_WEB_PKG = path.join(LOGHUB_ROOT, 'apps', 'console-web', 'package.json');

// Rogue hexes that violate official Skyra branding (#1D4ED8 is legacy blue; #0284c7 is old cyan-blue; #3b82f6 is generic blue)
const PROHIBITED_BRAND_HEXES = [
  /#1D4ED8\b/i, // Legacy Tailwind blue
  /#0284c7\b/i, // Legacy sky-600
  /#1e40af\b/i, // Legacy blue-800
  /#2563eb\b/i  // Legacy blue-600
];

// Documented exceptions:
// - tokens.css & themes.css (where platform tokens and legacy fallbacks are mapped)
// - severity tokens (ECS product-specific colors: fatal/error/warn/debug/info)
const ALLOWED_HEX_FILES = [
  'tokens.css',
  'themes.css',
  'typography.css'
];

// All 20 installed Skyra Platform packages
const ALL_PLATFORM_PACKAGES = [
  '@skyra-tech-platform/app-shell',
  '@skyra-tech-platform/badge',
  '@skyra-tech-platform/button',
  '@skyra-tech-platform/checkbox',
  '@skyra-tech-platform/data-export',
  '@skyra-tech-platform/data-table',
  '@skyra-tech-platform/date-time',
  '@skyra-tech-platform/design-tokens',
  '@skyra-tech-platform/dialog',
  '@skyra-tech-platform/drawer',
  '@skyra-tech-platform/dropdown-menu',
  '@skyra-tech-platform/empty-state',
  '@skyra-tech-platform/input',
  '@skyra-tech-platform/loader',
  '@skyra-tech-platform/notification',
  '@skyra-tech-platform/popover',
  '@skyra-tech-platform/switch',
  '@skyra-tech-platform/tabs',
  '@skyra-tech-platform/toast',
  '@skyra-tech-platform/utils'
];

// Core 16 UI Web Component packages that register Custom Elements
const CUSTOM_ELEMENT_PACKAGES = [
  '@skyra-tech-platform/app-shell',
  '@skyra-tech-platform/badge',
  '@skyra-tech-platform/button',
  '@skyra-tech-platform/checkbox',
  '@skyra-tech-platform/data-table',
  '@skyra-tech-platform/dialog',
  '@skyra-tech-platform/drawer',
  '@skyra-tech-platform/dropdown-menu',
  '@skyra-tech-platform/empty-state',
  '@skyra-tech-platform/input',
  '@skyra-tech-platform/loader',
  '@skyra-tech-platform/notification',
  '@skyra-tech-platform/popover',
  '@skyra-tech-platform/switch',
  '@skyra-tech-platform/tabs',
  '@skyra-tech-platform/toast'
];

function getSha256(filePath) {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function getAllFiles(dir, extensions = ['.ts', '.html', '.css']) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const item of list) {
    if (item === 'node_modules' || item === 'dist' || item === '.git' || item === 'coverage' || item === '.angular') continue;
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      results = results.concat(getAllFiles(fullPath, extensions));
    } else {
      const ext = path.extname(fullPath);
      if (extensions.includes(ext)) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

function runGovernanceAudit(options = {}) {
  const isSilent = options.silent || false;
  const log = (...args) => { if (!isSilent) console.log(...args); };
  const logError = (...args) => { if (!isSilent) console.error(...args); };

  log('===================================================================');
  log('SKYRA LOGHUB — DESIGN SYSTEM GOVERNANCE AUDIT');
  log('Milestones: PLATFORM-LOGHUB-002 & PLATFORM-LOGHUB-003');
  log('===================================================================\n');

  let violations = 0;
  const details = {
    gate1Fails: 0,
    gate2Fails: 0,
    gate3Fails: 0,
    gate4Fails: 0,
    gate5Fails: 0,
    gate6Fails: 0
  };

  // -------------------------------------------------------------
  // GATE 1: PROHIBITED BRAND HEX CODES
  // -------------------------------------------------------------
  log('[GATE 1] Scanning for unauthorized brand hex color codes...');
  const allSourceFiles = getAllFiles(CONSOLE_WEB_SRC);

  for (const file of allSourceFiles) {
    const basename = path.basename(file);
    if (ALLOWED_HEX_FILES.includes(basename)) continue;

    const content = fs.readFileSync(file, 'utf8');
    for (const pattern of PROHIBITED_BRAND_HEXES) {
      if (pattern.test(content)) {
        logError(`  [FAIL] Prohibited hex ${pattern} found in ${path.relative(LOGHUB_ROOT, file)}`);
        details.gate1Fails++;
        violations++;
      }
    }
  }

  if (details.gate1Fails === 0) {
    log(`  [PASS] 0 prohibited brand hex values found across ${allSourceFiles.length} source files.\n`);
  } else {
    logError(`  [FAIL] ${details.gate1Fails} prohibited brand hex violations detected.\n`);
  }

  // -------------------------------------------------------------
  // GATE 2: PRIVATE PACKAGE SOURCE IMPORTS
  // -------------------------------------------------------------
  log('[GATE 2] Checking for direct/private source directory imports...');
  const privateImportRegex = /from\s+['"][^'"]*skyra-platform\/packages\/[^'"]*\/src/i;
  const deepPlatformImportRegex = /from\s+['"]@skyra-tech-platform\/[^\/'"]+\/src/i;

  for (const file of allSourceFiles.filter(f => f.endsWith('.ts'))) {
    const content = fs.readFileSync(file, 'utf8');
    if (privateImportRegex.test(content) || deepPlatformImportRegex.test(content)) {
      logError(`  [FAIL] Private source import found in ${path.relative(LOGHUB_ROOT, file)}`);
      details.gate2Fails++;
      violations++;
    }
  }

  if (details.gate2Fails === 0) {
    log(`  [PASS] All platform imports consume official public package exports.\n`);
  } else {
    logError(`  [FAIL] ${details.gate2Fails} private import violations detected.\n`);
  }

  // -------------------------------------------------------------
  // GATE 3: ARTIFACT ARCHIVE & MANIFEST INTEGRITY
  // -------------------------------------------------------------
  log('[GATE 3] Validating local package archives against manifest...');

  if (!fs.existsSync(MANIFEST_PATH)) {
    logError(`  [FAIL] Manifest missing: ${MANIFEST_PATH}`);
    details.gate3Fails++;
    violations++;
  } else {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    log(`  Manifest platform commit: ${manifest.platformCommit}`);
    log(`  Manifest packages tracked: ${manifest.packages.length}`);

    for (const pkg of manifest.packages) {
      const archivePath = path.join(ARTIFACTS_DIR, pkg.archive);
      if (!fs.existsSync(archivePath)) {
        logError(`  [FAIL] Archive missing for ${pkg.name}: ${pkg.archive}`);
        details.gate3Fails++;
        violations++;
        continue;
      }

      const currentSha = getSha256(archivePath);
      if (currentSha !== pkg.sha256) {
        logError(`  [FAIL] SHA256 mismatch for ${pkg.archive}: expected ${pkg.sha256}, got ${currentSha}`);
        details.gate3Fails++;
        violations++;
      }
    }
  }

  if (details.gate3Fails === 0) {
    log(`  [PASS] All local platform package archives match SHA256 manifest integrity.\n`);
  } else {
    logError(`  [FAIL] ${details.gate3Fails} archive integrity violations detected.\n`);
  }

  // -------------------------------------------------------------
  // GATE 4: PACKAGE DEPENDENCY RESOLUTION (ALL 20 PACKAGES)
  // -------------------------------------------------------------
  log('[GATE 4] Checking package.json dependency references (all 20 packages)...');
  const pkgData = JSON.parse(fs.readFileSync(CONSOLE_WEB_PKG, 'utf8'));
  const allDeps = { ...(pkgData.dependencies || {}), ...(pkgData.devDependencies || {}) };

  for (const pkgName of ALL_PLATFORM_PACKAGES) {
    const ref = allDeps[pkgName];
    if (!ref) {
      logError(`  [FAIL] Missing required platform package dependency: ${pkgName}`);
      details.gate4Fails++;
      violations++;
    } else if (!ref.startsWith('file:')) {
      logError(`  [FAIL] Dependency ${pkgName} does not point to local file artifact: ${ref}`);
      details.gate4Fails++;
      violations++;
    }
  }

  if (details.gate4Fails === 0) {
    log(`  [PASS] All ${ALL_PLATFORM_PACKAGES.length} installed platform packages resolve to local archives.\n`);
  } else {
    logError(`  [FAIL] ${details.gate4Fails} dependency resolution violations detected.\n`);
  }

  // -------------------------------------------------------------
  // GATE 5: CUSTOM ELEMENT REGISTRATION IN ENTRYPOINT
  // -------------------------------------------------------------
  log('[GATE 5] Verifying Web Components registration in main.ts...');
  const mainTsPath = path.join(CONSOLE_WEB_SRC, 'main.ts');
  const mainTsContent = fs.readFileSync(mainTsPath, 'utf8');

  for (const pkgName of CUSTOM_ELEMENT_PACKAGES) {
    if (!mainTsContent.includes(`import '${pkgName}';`)) {
      logError(`  [FAIL] ${pkgName} is not imported in main.ts for Custom Elements registration`);
      details.gate5Fails++;
      violations++;
    }
  }

  if (details.gate5Fails === 0) {
    log(`  [PASS] All ${CUSTOM_ELEMENT_PACKAGES.length} Custom Element packages registered upon application bootstrap.\n`);
  } else {
    logError(`  [FAIL] ${details.gate5Fails} registration violations detected.\n`);
  }

  // -------------------------------------------------------------
  // GATE 6: ZERO UNAUTHORIZED DUPLICATE SHARED PRIMITIVES
  // -------------------------------------------------------------
  log('[GATE 6] Checking for unauthorized local shared primitive duplications...');
  // Ensure that no component inside src/app/shared/ui independently re-implements button or badge or drawer without platform
  const sharedUiFiles = getAllFiles(path.join(CONSOLE_WEB_SRC, 'app', 'shared', 'ui'), ['.ts']);
  for (const file of sharedUiFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const isComponent = content.includes('@Component(');
    if (!isComponent) continue;

    // Button component must compose skyra-tech-button
    if (file.includes('button.component.ts') && !content.includes('skyra-tech-button')) {
      logError(`  [FAIL] ButtonComponent does not compose <skyra-tech-button> in ${path.relative(LOGHUB_ROOT, file)}`);
      details.gate6Fails++;
      violations++;
    }
    // Badge component must compose skyra-tech-badge
    if (file.includes('badge.component.ts') && !content.includes('skyra-tech-badge')) {
      logError(`  [FAIL] BadgeComponent does not compose <skyra-tech-badge> in ${path.relative(LOGHUB_ROOT, file)}`);
      details.gate6Fails++;
      violations++;
    }
    // SeverityBadgeComponent must compose skyra-tech-badge
    if (file.includes('severity-badge.component.ts') && !content.includes('skyra-tech-badge')) {
      logError(`  [FAIL] SeverityBadgeComponent does not compose <skyra-tech-badge> in ${path.relative(LOGHUB_ROOT, file)}`);
      details.gate6Fails++;
      violations++;
    }
    // EmptyStateComponent must compose skyra-tech-empty-state
    if (file.includes('empty-state.component.ts') && !content.includes('skyra-tech-empty-state')) {
      logError(`  [FAIL] EmptyStateComponent does not compose <skyra-tech-empty-state> in ${path.relative(LOGHUB_ROOT, file)}`);
      details.gate6Fails++;
      violations++;
    }
  }

  if (details.gate6Fails === 0) {
    log(`  [PASS] 0 unauthorized duplicated shared primitives found across shared UI.\n`);
  } else {
    logError(`  [FAIL] ${details.gate6Fails} duplicate primitive violations detected.\n`);
  }

  // -------------------------------------------------------------
  // SUMMARY VERDICT
  // -------------------------------------------------------------
  log('===================================================================');
  if (violations === 0) {
    log('AUDIT VERDICT: PASS — 100% DESIGN SYSTEM GOVERNANCE COMPLIANCE');
    log('===================================================================');
    if (!options.returnResult) process.exit(0);
    return { passed: true, violations: 0, details };
  } else {
    logError(`AUDIT VERDICT: FAIL — ${violations} TOTAL GOVERNANCE VIOLATIONS DETECTED`);
    log('===================================================================');
    if (!options.returnResult) process.exit(1);
    return { passed: false, violations, details };
  }
}

if (require.main === module) {
  runGovernanceAudit();
}

module.exports = { runGovernanceAudit };
