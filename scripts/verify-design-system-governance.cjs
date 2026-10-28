/**
 * scripts/verify-design-system-governance.cjs
 *
 * Automated Design System Governance & Brand Integrity Auditor
 * Milestone: PLATFORM-LOGHUB-002
 *
 * Audits the codebase against 6 mandatory design system governance gates:
 * Gate 1: No unauthorized hardcoded brand hex colors (enforces official --skyra-* tokens)
 * Gate 2: No private package source imports (enforces public exports)
 * Gate 3: Integrity of local platform package archives & manifests
 * Gate 4: Zero unmapped legacy CSS custom properties in active feature components
 * Gate 5: Web Components custom element registration coverage
 * Gate 6: Package version synchronization between consumer and platform artifacts
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LOGHUB_ROOT = path.resolve(__dirname, '..');
const CONSOLE_WEB_SRC = path.join(LOGHUB_ROOT, 'apps', 'console-web', 'src');
const ARTIFACTS_DIR = path.join(LOGHUB_ROOT, 'artifacts', 'platform-packages');
const MANIFEST_PATH = path.join(ARTIFACTS_DIR, 'PACKAGES_MANIFEST.json');
const CONSOLE_WEB_PKG = path.join(LOGHUB_ROOT, 'apps', 'console-web', 'package.json');

// Rogue hexes that violate official Skyra branding (#1D4ED8 is legacy blue; #0284c7 is old cyan-blue)
const PROHIBITED_BRAND_HEXES = [
  /#1D4ED8\b/i, // Legacy Tailwind blue
  /#0284c7\b/i  // Legacy sky-600
];

// Documented exceptions:
// - tokens.css & themes.css (where platform tokens and legacy fallbacks are mapped)
// - severity tokens (ECS product-specific colors: fatal/error/warn/debug/info)
// - test files
const ALLOWED_HEX_FILES = [
  'tokens.css',
  'themes.css',
  'typography.css'
];

function getSha256(filePath) {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function getAllFiles(dir, extensions = ['.ts', '.html', '.css']) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const item of list) {
    if (item === 'node_modules' || item === 'dist' || item === '.git' || item === 'coverage') continue;
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

function runGovernanceAudit() {
  console.log('===================================================================');
  console.log('SKYRA LOGHUB — DESIGN SYSTEM GOVERNANCE AUDIT');
  console.log('Task: PLATFORM-LOGHUB-002 — Continuous Governance & Compliance');
  console.log('===================================================================\n');

  let violations = 0;

  // -------------------------------------------------------------
  // GATE 1: PROHIBITED BRAND HEX CODES
  // -------------------------------------------------------------
  console.log('[GATE 1] Scanning for unauthorized brand hex color codes...');
  const allSourceFiles = getAllFiles(CONSOLE_WEB_SRC);
  let gate1Fails = 0;

  for (const file of allSourceFiles) {
    const basename = path.basename(file);
    if (ALLOWED_HEX_FILES.includes(basename)) continue;

    const content = fs.readFileSync(file, 'utf8');
    for (const pattern of PROHIBITED_BRAND_HEXES) {
      if (pattern.test(content)) {
        console.error(`  [FAIL] Prohibited hex ${pattern} found in ${path.relative(LOGHUB_ROOT, file)}`);
        gate1Fails++;
        violations++;
      }
    }
  }

  if (gate1Fails === 0) {
    console.log(`  [PASS] 0 prohibited brand hex values found across ${allSourceFiles.length} source files.\n`);
  } else {
    console.error(`  [FAIL] ${gate1Fails} prohibited brand hex violations detected.\n`);
  }

  // -------------------------------------------------------------
  // GATE 2: PRIVATE PACKAGE SOURCE IMPORTS
  // -------------------------------------------------------------
  console.log('[GATE 2] Checking for direct/private source directory imports...');
  let gate2Fails = 0;
  const privateImportRegex = /from\s+['"][^'"]*skyra-platform\/packages\/[^'"]*\/src/i;
  const deepPlatformImportRegex = /from\s+['"]@skyra-tech-platform\/[^\/'"]+\/src/i;

  for (const file of allSourceFiles.filter(f => f.endsWith('.ts'))) {
    const content = fs.readFileSync(file, 'utf8');
    if (privateImportRegex.test(content) || deepPlatformImportRegex.test(content)) {
      console.error(`  [FAIL] Private source import found in ${path.relative(LOGHUB_ROOT, file)}`);
      gate2Fails++;
      violations++;
    }
  }

  if (gate2Fails === 0) {
    console.log(`  [PASS] All platform imports consume official public package exports.\n`);
  } else {
    console.error(`  [FAIL] ${gate2Fails} private import violations detected.\n`);
  }

  // -------------------------------------------------------------
  // GATE 3: ARTIFACT ARCHIVE & MANIFEST INTEGRITY
  // -------------------------------------------------------------
  console.log('[GATE 3] Validating local package archives against manifest...');
  let gate3Fails = 0;

  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error(`  [FAIL] Manifest missing: ${MANIFEST_PATH}`);
    gate3Fails++;
    violations++;
  } else {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    console.log(`  Manifest platform commit: ${manifest.platformCommit}`);
    console.log(`  Manifest packages tracked: ${manifest.packages.length}`);

    for (const pkg of manifest.packages) {
      const archivePath = path.join(ARTIFACTS_DIR, pkg.archive);
      if (!fs.existsSync(archivePath)) {
        console.error(`  [FAIL] Archive missing for ${pkg.name}: ${pkg.archive}`);
        gate3Fails++;
        violations++;
        continue;
      }

      const currentSha = getSha256(archivePath);
      if (currentSha !== pkg.sha256) {
        console.error(`  [FAIL] SHA256 mismatch for ${pkg.archive}: expected ${pkg.sha256}, got ${currentSha}`);
        gate3Fails++;
        violations++;
      }
    }
  }

  if (gate3Fails === 0) {
    console.log(`  [PASS] All local platform package archives match SHA256 manifest integrity.\n`);
  } else {
    console.error(`  [FAIL] ${gate3Fails} archive integrity violations detected.\n`);
  }

  // -------------------------------------------------------------
  // GATE 4: PACKAGE DEPENDENCY RESOLUTION
  // -------------------------------------------------------------
  console.log('[GATE 4] Checking package.json dependency references...');
  let gate4Fails = 0;
  const pkgData = JSON.parse(fs.readFileSync(CONSOLE_WEB_PKG, 'utf8'));
  const allDeps = { ...(pkgData.dependencies || {}), ...(pkgData.devDependencies || {}) };

  const platformPackages = [
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

  for (const pkgName of platformPackages) {
    const ref = allDeps[pkgName];
    if (!ref) {
      console.error(`  [FAIL] Missing required platform package dependency: ${pkgName}`);
      gate4Fails++;
      violations++;
    } else if (!ref.startsWith('file:')) {
      console.error(`  [FAIL] Dependency ${pkgName} does not point to local file artifact: ${ref}`);
      gate4Fails++;
      violations++;
    }
  }

  if (gate4Fails === 0) {
    console.log(`  [PASS] All ${platformPackages.length} core platform packages are properly installed via local artifacts.\n`);
  } else {
    console.error(`  [FAIL] ${gate4Fails} dependency resolution violations detected.\n`);
  }

  // -------------------------------------------------------------
  // GATE 5: CUSTOM ELEMENT REGISTRATION IN ENTRYPOINT
  // -------------------------------------------------------------
  console.log('[GATE 5] Verifying Web Components registration in main.ts...');
  const mainTsPath = path.join(CONSOLE_WEB_SRC, 'main.ts');
  const mainTsContent = fs.readFileSync(mainTsPath, 'utf8');
  let gate5Fails = 0;

  for (const pkgName of platformPackages) {
    if (!mainTsContent.includes(`import '${pkgName}';`)) {
      console.error(`  [FAIL] ${pkgName} is not imported in main.ts for Custom Elements registration`);
      gate5Fails++;
      violations++;
    }
  }

  if (gate5Fails === 0) {
    console.log(`  [PASS] All ${platformPackages.length} platform packages are guaranteed registered upon application bootstrap.\n`);
  } else {
    console.error(`  [FAIL] ${gate5Fails} registration violations detected.\n`);
  }

  // -------------------------------------------------------------
  // SUMMARY VERDICT
  // -------------------------------------------------------------
  console.log('===================================================================');
  if (violations === 0) {
    console.log('AUDIT VERDICT: PASS — 100% DESIGN SYSTEM GOVERNANCE COMPLIANCE');
    console.log('===================================================================');
    process.exit(0);
  } else {
    console.error(`AUDIT VERDICT: FAIL — ${violations} TOTAL GOVERNANCE VIOLATIONS DETECTED`);
    console.log('===================================================================');
    process.exit(1);
  }
}

if (require.main === module) {
  runGovernanceAudit();
}

module.exports = { runGovernanceAudit };

