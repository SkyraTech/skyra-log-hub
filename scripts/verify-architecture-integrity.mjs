/**
 * scripts/verify-architecture-integrity.mjs
 *
 * Automated Architecture & Code Quality Governance Auditor
 * Milestone: Q-03 — Engineering Architecture & Code Quality
 *
 * Enforces 6 structural architecture gates:
 * Gate 1: Cross-Application Boundary Isolation (zero cross-app imports between apps/*)
 * Gate 2: Platform Package Public Export Governance (no private /src/ or /dist/ deep imports)
 * Gate 3: Service Authority & Database Boundaries (BFF has no ORM/DB; Query is strictly read-only)
 * Gate 4: Angular Component Lifecycle & Subscription Safety (no unmanaged subscriptions)
 * Gate 5: Contract & Canonical Schema Parity (v1 schemas synchronized)
 * Gate 6: Design System Token & Component Governance (100% compliance with platform tokens)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(__filename), '..');

function getAllFiles(dir, filter = () => true) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) {
      if (item.name !== 'node_modules' && item.name !== 'dist' && !item.name.startsWith('.')) {
        results.push(...getAllFiles(full, filter));
      }
    } else if (item.isFile() && filter(full)) {
      results.push(full);
    }
  }
  return results;
}

let violations = 0;
const report = {
  auditedAt: new Date().toISOString(),
  gates: [],
  verdict: 'PENDING'
};

console.log('===================================================================');
console.log('SKYRA LOGHUB — ARCHITECTURE & CODE QUALITY GOVERNANCE AUDIT');
console.log('Milestone: Q-03 — Engineering Architecture & Code Quality');
console.log('===================================================================\n');

// -------------------------------------------------------------
// GATE 1: CROSS-APPLICATION BOUNDARY ISOLATION
// -------------------------------------------------------------
console.log('[GATE 1] Checking Cross-Application Boundary Isolation...');
const appsDir = path.join(root, 'apps');
const appNames = fs.readdirSync(appsDir).filter(name => {
  return fs.statSync(path.join(appsDir, name)).isDirectory() && !name.startsWith('.');
});

let gate1Fails = 0;
for (const app of appNames) {
  const srcDir = path.join(appsDir, app, 'src');
  if (!fs.existsSync(srcDir)) continue;
  const files = getAllFiles(srcDir, f => f.endsWith('.ts') || f.endsWith('.js') || f.endsWith('.mjs'));
  
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    for (const otherApp of appNames) {
      if (otherApp === app) continue;
      // Disallow importing ../../otherApp or @skyra/<other-app> directly across service boundaries
      const relativeCrossApp = new RegExp(`['"]\\.\\./.*apps/${otherApp}`, 'g');
      if (relativeCrossApp.test(content)) {
        console.error(`  [FAIL] Cross-app import in ${path.relative(root, file)} -> apps/${otherApp}`);
        gate1Fails++;
        violations++;
      }
    }
  }
}

if (gate1Fails === 0) {
  console.log(`  [PASS] All ${appNames.length} applications strictly isolated. Zero cross-app imports detected.\n`);
  report.gates.push({ gate: 1, name: 'Cross-Application Boundary Isolation', status: 'PASS', violations: 0 });
} else {
  report.gates.push({ gate: 1, name: 'Cross-Application Boundary Isolation', status: 'FAIL', violations: gate1Fails });
}

// -------------------------------------------------------------
// GATE 2: PLATFORM PACKAGE PUBLIC EXPORT GOVERNANCE
// -------------------------------------------------------------
console.log('[GATE 2] Checking Platform Package Public Export Governance...');
let gate2Fails = 0;
const allSourceFiles = getAllFiles(path.join(root, 'apps/console-web/src'), f => f.endsWith('.ts'));

for (const file of allSourceFiles) {
  const content = fs.readFileSync(file, 'utf8');
  if (/@skyra-tech-platform\/[^/'"]+\/(src|dist)\b/.test(content)) {
    console.error(`  [FAIL] Deep platform import detected in ${path.relative(root, file)}`);
    gate2Fails++;
    violations++;
  }
}

if (gate2Fails === 0) {
  console.log('  [PASS] All platform package imports consume official public entrypoints.\n');
  report.gates.push({ gate: 2, name: 'Platform Package Public Export Governance', status: 'PASS', violations: 0 });
} else {
  report.gates.push({ gate: 2, name: 'Platform Package Public Export Governance', status: 'FAIL', violations: gate2Fails });
}

// -------------------------------------------------------------
// GATE 3: SERVICE AUTHORITY & DATABASE BOUNDARIES
// -------------------------------------------------------------
console.log('[GATE 3] Validating Service Authority & Database Boundaries...');
let gate3Fails = 0;

// Console-BFF must have zero database / Prisma dependencies
const bffPkg = JSON.parse(fs.readFileSync(path.join(root, 'apps/console-bff/package.json'), 'utf8'));
const bffDeps = { ...bffPkg.dependencies, ...bffPkg.devDependencies };
if (bffDeps['@prisma/client'] || bffDeps['prisma']) {
  console.error('  [FAIL] console-bff package.json contains direct Prisma database dependency');
  gate3Fails++;
  violations++;
}

// Query-Service Prisma service must enforce read-only transactions
const queryPrisma = fs.readFileSync(path.join(root, 'apps/query-service/src/metadata/prisma.service.ts'), 'utf8');
if (!queryPrisma.includes('default_transaction_read_only=on')) {
  console.error('  [FAIL] query-service PrismaService does not enforce default_transaction_read_only=on');
  gate3Fails++;
  violations++;
}

if (gate3Fails === 0) {
  console.log('  [PASS] Service authority boundaries confirmed (BFF is DB-free; Query is read-only).\n');
  report.gates.push({ gate: 3, name: 'Service Authority & Database Boundaries', status: 'PASS', violations: 0 });
} else {
  report.gates.push({ gate: 3, name: 'Service Authority & Database Boundaries', status: 'FAIL', violations: gate3Fails });
}

// -------------------------------------------------------------
// GATE 4: ANGULAR COMPONENT LIFECYCLE & SUBSCRIPTION SAFETY
// -------------------------------------------------------------
console.log('[GATE 4] Checking Angular Component Lifecycle & Subscription Safety...');
let gate4Fails = 0;
const componentFiles = getAllFiles(path.join(root, 'apps/console-web/src/app'), f => f.endsWith('.component.ts'));

for (const file of componentFiles) {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    // Flag direct .subscribe calls in components that do not have lifecycle guards
    if (line.includes('.subscribe(')) {
      const hasTakeUntil = line.includes('takeUntil') || line.includes('takeUntilDestroyed') || line.includes('firstValueFrom');
      // Look back 3 lines for pipe(takeUntil...)
      const context = lines.slice(Math.max(0, idx - 4), idx + 1).join('\n');
      const contextHasGuard = context.includes('takeUntilDestroyed') || context.includes('takeUntil(') || context.includes('firstValueFrom');
      if (!hasTakeUntil && !contextHasGuard) {
        console.error(`  [FAIL] Unbounded subscription in ${path.relative(root, file)}:${idx + 1}`);
        gate4Fails++;
        violations++;
      }
    }
  });
}

if (gate4Fails === 0) {
  console.log('  [PASS] All Angular component subscriptions bounded by lifecycle cleanup.\n');
  report.gates.push({ gate: 4, name: 'Angular Subscription Lifecycle Safety', status: 'PASS', violations: 0 });
} else {
  report.gates.push({ gate: 4, name: 'Angular Subscription Lifecycle Safety', status: 'FAIL', violations: gate4Fails });
}

// -------------------------------------------------------------
// GATE 5: CONTRACT & CANONICAL SCHEMA PARITY
// -------------------------------------------------------------
console.log('[GATE 5] Verifying Contract & Canonical Schema Parity...');
const schemaSyncResult = spawnSync(process.execPath, [path.join(root, 'scripts/sync-schemas.mjs'), '--check'], {
  cwd: root,
  encoding: 'utf8'
});

if (schemaSyncResult.status === 0) {
  console.log('  [PASS] Canonical v1 schema parity confirmed across TypeScript and Python contracts.\n');
  report.gates.push({ gate: 5, name: 'Schema & Contract Parity', status: 'PASS', violations: 0 });
} else {
  console.error('  [FAIL] Schema sync check failed:\n' + schemaSyncResult.stderr + schemaSyncResult.stdout);
  violations++;
  report.gates.push({ gate: 5, name: 'Schema & Contract Parity', status: 'FAIL', violations: 1 });
}

// -------------------------------------------------------------
// GATE 6: DESIGN SYSTEM TOKEN & COMPONENT GOVERNANCE
// -------------------------------------------------------------
console.log('[GATE 6] Running Design System Governance Auditor...');
const govResult = spawnSync(process.execPath, [path.join(root, 'scripts/verify-design-system-governance.cjs')], {
  cwd: root,
  encoding: 'utf8'
});

if (govResult.status === 0) {
  console.log('  [PASS] 100% Design system governance compliance.\n');
  report.gates.push({ gate: 6, name: 'Design System Governance', status: 'PASS', violations: 0 });
} else {
  console.error('  [FAIL] Design system governance check failed:\n' + govResult.stderr + govResult.stdout);
  violations++;
  report.gates.push({ gate: 6, name: 'Design System Governance', status: 'FAIL', violations: 1 });
}

console.log('===================================================================');
report.verdict = violations === 0 ? 'PASS' : 'FAIL';
console.log(`ARCHITECTURE AUDIT VERDICT: ${report.verdict} (${violations} violations)`);
console.log('===================================================================');

if (process.argv[2]) {
  fs.writeFileSync(path.resolve(process.argv[2]), JSON.stringify(report, null, 2));
  console.log(`Results written to ${process.argv[2]}`);
}

process.exit(violations === 0 ? 0 : 1);

