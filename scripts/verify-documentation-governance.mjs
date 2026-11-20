#!/usr/bin/env node
/**
 * Skyra LogHub — Documentation Governance Auditor
 * 
 * Verifies:
 * Gate 1: Exactly 8 canonical documents exist under docs/ with expected names and headings
 * Gate 2: No unauthorized Markdown files inside docs/
 * Gate 3: Relative Markdown link integrity (zero broken links)
 * Gate 4: Allowlist compliance for root, apps, and packages
 * Gate 5: Historical preservation integrity (DEV-018 manifest, DEV-013 evidence files)
 * Gate 6: Canonical source reference validity
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const ROOT = process.cwd();

const EXPECTED_CANONICAL_DOCS = [
  'docs/01-FUNCTIONALITY.md',
  'docs/02-ARCHITECTURE.md',
  'docs/03-DATABASE-ARCHITECTURE.md',
  'docs/04-API-AND-CONTRACTS.md',
  'docs/05-SECURITY-ARCHITECTURE.md',
  'docs/06-LOGGING-AND-STORAGE.md',
  'docs/07-UI-UX-ARCHITECTURE.md',
  'docs/08-TESTING-AND-QUALITY.md'
];

const ALLOWED_PACKAGE_DOCS = new Set([
  'apps/admin-service/README.md',
  'apps/console-bff/README.md',
  'apps/console-web/README.md',
  'apps/ingestion-gateway/README.md',
  'apps/log-shipper/README.md',
  'apps/query-service/README.md',
  'contracts/ingestion/v1/README.md',
  'contracts/storage-contract.md',
  'packages/logger-angular/README.md',
  'packages/logger-browser/README.md',
  'packages/logger-nestjs/README.md',
  'packages/logger-next/README.md',
  'packages/logger-node/README.md',
  'packages/logger-python/README.md',
  'packages/logger-react/README.md'
]);

const ALLOWED_ROOT_DOCS = new Set([
  'README.md',
  'Q-02A-DEPENDENCY-SECURITY-ACCEPTANCE.md',
  'Q-02B-FINAL-SECURITY-VERIFICATION.md',
  'Q-02C-FINAL-INTEGRATED-ACCEPTANCE.md',
  'Q-03-ARCHITECTURE-QUALITY-ACCEPTANCE.md'
]);

const DEV018_MANIFEST_HASH = 'e04cac412cb4c9962ba0228778313c331568df2bbe59bb8613d2b0e9f64fd90a';
const DEV013_FILES = [
  { path: '.tmp/dev013-evidence/session-admin.log', hash: '056a20c78aebaae75909b1eef55071227caed617d2089043bb24f98993b7f4a6' },
  { path: '.tmp/dev013-evidence/outage-recovery.json', hash: '29fdf79179f1157b9604abf726980167b3ebc459fbdea28a34b51e498906136d' },
  { path: '.tmp/dev013-evidence/http-security.json', hash: 'ea9eeedc94b000bb29b55d4495e6fd950ce724a91e0e565015619c597fe6a81f' },
  { path: '.tmp/dev013-evidence/persistence.json', hash: 'fa232441d10bda6f12dbb2d755baa309ca3e7a19ae80c81d86314115b400e596' }
];

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function findMdFiles(dir, list = []) {
  if (!fs.existsSync(dir)) return list;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (['node_modules', '.git', '.angular', 'dist', 'dist-test', '.tmp'].includes(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      findMdFiles(full, list);
    } else if (e.name.endsWith('.md')) {
      list.push(full.split(path.sep).join('/'));
    }
  }
  return list;
}

const results = {
  timestamp: new Date().toISOString(),
  gates: {},
  summary: { totalGates: 6, passedGates: 0, failedGates: 0 },
  violations: []
};

function recordGate(gateId, name, passed, details = {}) {
  results.gates[gateId] = { name, passed, details };
  if (passed) {
    results.summary.passedGates++;
    console.log(`✔ [PASS] Gate ${gateId}: ${name}`);
  } else {
    results.summary.failedGates++;
    console.error(`✖ [FAIL] Gate ${gateId}: ${name}`);
  }
}

console.log('--- Skyra LogHub Documentation Governance Audit ---');

// GATE 1: Verify all 8 canonical documents exist and have required headings
const gate1Missing = [];
const gate1Headings = {};
for (const doc of EXPECTED_CANONICAL_DOCS) {
  if (!fs.existsSync(path.join(ROOT, doc))) {
    gate1Missing.push(doc);
  } else {
    const content = fs.readFileSync(path.join(ROOT, doc), 'utf8');
    const firstLine = content.split('\n')[0].trim();
    gate1Headings[doc] = firstLine;
    if (!firstLine.startsWith('# Skyra LogHub')) {
      results.violations.push(`Gate 1: Canonical heading invalid in ${doc}: "${firstLine}"`);
    }
  }
}
const gate1Pass = gate1Missing.length === 0 && results.violations.length === 0;
recordGate('DOC-GATE-1', 'Canonical Documentation Existence & Headings', gate1Pass, {
  expectedCount: EXPECTED_CANONICAL_DOCS.length,
  missing: gate1Missing,
  headings: gate1Headings
});

// GATE 2: Exactly 8 Markdown files in docs/ (zero sprawl)
const docsMdFiles = findMdFiles('docs');
const gate2Extra = docsMdFiles.filter(f => !EXPECTED_CANONICAL_DOCS.includes(f));
const gate2Pass = docsMdFiles.length === EXPECTED_CANONICAL_DOCS.length && gate2Extra.length === 0;
if (!gate2Pass) {
  results.violations.push(`Gate 2: Unexpected markdown files in docs/: ${gate2Extra.join(', ')}`);
}
recordGate('DOC-GATE-2', 'Documentation Isolation & Zero Sprawl in docs/', gate2Pass, {
  docsCount: docsMdFiles.length,
  expectedCount: EXPECTED_CANONICAL_DOCS.length,
  unexpectedFiles: gate2Extra
});

// GATE 3: Relative Markdown link integrity across canonical docs & READMEs
const brokenLinks = [];
const allAuditedDocs = [...EXPECTED_CANONICAL_DOCS, 'README.md', ...ALLOWED_PACKAGE_DOCS];
for (const doc of allAuditedDocs) {
  const fullPath = path.join(ROOT, doc);
  if (!fs.existsSync(fullPath)) continue;
  const content = fs.readFileSync(fullPath, 'utf8');
  // Match markdown links [text](target)
  const linkMatches = [...content.matchAll(/\[([^\]]+)\]\(([^)#]+)(?:#[^)]*)?\)/g)];
  for (const m of linkMatches) {
    const rawTarget = m[2].trim();
    if (rawTarget.startsWith('http://') || rawTarget.startsWith('https://') || rawTarget.startsWith('mailto:') || rawTarget.startsWith('#')) {
      continue;
    }
    const resolved = path.resolve(path.dirname(fullPath), rawTarget);
    if (!fs.existsSync(resolved)) {
      brokenLinks.push({ source: doc, link: rawTarget, resolved });
      results.violations.push(`Gate 3: Broken link in ${doc}: "${rawTarget}"`);
    }
  }
}
const gate3Pass = brokenLinks.length === 0;
recordGate('DOC-GATE-3', 'Markdown Link & Target Integrity', gate3Pass, {
  auditedFilesCount: allAuditedDocs.length,
  brokenLinksCount: brokenLinks.length,
  brokenLinks
});

// GATE 4: Repository Markdown Allowlist Compliance
const allRepoMd = findMdFiles('.');
const gate4Unauthorized = [];
for (const file of allRepoMd) {
  if (EXPECTED_CANONICAL_DOCS.includes(file)) continue;
  if (ALLOWED_PACKAGE_DOCS.has(file)) continue;
  if (ALLOWED_ROOT_DOCS.has(file)) continue;
  if (file.startsWith('SKYRA_LOGHUB_') && file.endsWith('.md')) continue; // Historical report
  gate4Unauthorized.push(file);
  results.violations.push(`Gate 4: Unauthorized markdown file in repository: ${file}`);
}
const gate4Pass = gate4Unauthorized.length === 0;
recordGate('DOC-GATE-4', 'Repository Markdown Inventory & Allowlist Governance', gate4Pass, {
  totalScannedMd: allRepoMd.length,
  unauthorizedFiles: gate4Unauthorized
});

// GATE 5: Historical Evidence & DEV-018 Hash Invariant
let gate5Pass = true;
const manifestPath = path.join(ROOT, '.tmp/dev018-evidence/prior-evidence-hashes.json');
let manifestMatch = false;
if (fs.existsSync(manifestPath)) {
  const mHash = sha256(manifestPath);
  manifestMatch = (mHash === DEV018_MANIFEST_HASH);
  if (!manifestMatch) {
    gate5Pass = false;
    results.violations.push(`Gate 5: DEV-018 baseline manifest SHA-256 mismatch`);
  }
} else {
  gate5Pass = false;
  results.violations.push(`Gate 5: DEV-018 manifest missing`);
}

const dev013Check = [];
for (const item of DEV013_FILES) {
  const full = path.join(ROOT, item.path);
  if (fs.existsSync(full)) {
    const h = sha256(full);
    const ok = (h === item.hash);
    dev013Check.push({ path: item.path, ok, hash: h });
    if (!ok) {
      gate5Pass = false;
      results.violations.push(`Gate 5: Hash mismatch for ${item.path}`);
    }
  } else {
    gate5Pass = false;
    dev013Check.push({ path: item.path, ok: false, missing: true });
    results.violations.push(`Gate 5: Missing historical evidence file ${item.path}`);
  }
}
recordGate('DOC-GATE-5', 'Historical Evidence Preservation & Immutability', gate5Pass, {
  manifestVerified: manifestMatch,
  dev013Files: dev013Check
});

// GATE 6: Source Reference Grounding
const gate6Checks = [
  { ref: 'apps/console-web/src/app', desc: 'Angular console source' },
  { ref: 'apps/console-bff/src/modules/auth/application/postgres-session.repository.ts', desc: 'BFF session repository' },
  { ref: 'apps/admin-service/src/core/database/admin-prisma.ts', desc: 'Admin Prisma database adapter' },
  { ref: 'apps/ingestion-gateway/prisma/schema.prisma', desc: 'Authoritative Prisma schema' },
  { ref: 'contracts/ingestion/v1/openapi.yaml', desc: 'Ingestion OpenAPI contract' },
  { ref: 'artifacts/platform-packages', desc: 'Immutable platform packages directory' }
];
let gate6Pass = true;
const missingRefs = [];
for (const c of gate6Checks) {
  if (!fs.existsSync(path.join(ROOT, c.ref))) {
    gate6Pass = false;
    missingRefs.push(c);
    results.violations.push(`Gate 6: Missing canonical source reference: ${c.ref}`);
  }
}
recordGate('DOC-GATE-6', 'Source Code Reference Grounding', gate6Pass, {
  checkedCount: gate6Checks.length,
  missingRefs
});

console.log('----------------------------------------------------');
console.log(`Governance Summary: ${results.summary.passedGates}/${results.summary.totalGates} Gates Passed (${results.violations.length} violations)`);

// Save audit results
const outDir = path.join(ROOT, '.tmp/q04-audit');
if (fs.existsSync(outDir)) {
  const runs = fs.readdirSync(outDir).filter(d => d.startsWith('run-')).sort().reverse();
  if (runs.length > 0) {
    const latestRun = path.join(outDir, runs[0]);
    fs.writeFileSync(path.join(latestRun, 'documentation-governance.json'), JSON.stringify(results, null, 2));
    console.log(`Wrote documentation governance report to ${latestRun}/documentation-governance.json`);
  }
}

if (results.summary.failedGates > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
