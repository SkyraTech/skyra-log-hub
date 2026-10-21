#!/usr/bin/env node
/**
 * Schema Synchronization & Consistency Check Utility
 * Ensures contracts/schemas/v1/log-event.schema.json remains strictly synchronized
 * with embedded schemas in @skyra/logger-core and skyra_logger (Python).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const CANONICAL_SCHEMA_PATH = path.join(ROOT_DIR, 'contracts/schemas/v1/log-event.schema.json');
const TS_SCHEMA_PATH = path.join(ROOT_DIR, 'packages/logger-core/src/schema.ts');
const PY_SCHEMA_PATH = path.join(ROOT_DIR, 'packages/logger-python/skyra_logger/schema.py');

const isCheckOnly = process.argv.includes('--check');

function generateTsContent(schemaJson) {
  const formattedJson = JSON.stringify(schemaJson, null, 2);
  return `/**
 * Canonical Skyra Log Event Schema v1.0.0
 * Pinned to JSON Schema Draft 2020-12 and Elastic Common Schema (ECS) 8.11.0.
 *
 * NOTE: Auto-generated from contracts/schemas/v1/log-event.schema.json
 * Run \`pnpm run sync:schemas\` to synchronize or \`pnpm run check:schema-sync\` to verify.
 */

export const LOG_EVENT_SCHEMA_V1 = ${formattedJson} as const;
`;
}

function generatePyContent(schemaJson) {
  const formattedJson = JSON.stringify(schemaJson, null, 4)
    .replace(/: true/g, ': True')
    .replace(/: false/g, ': False')
    .replace(/: null/g, ': None');

  return `"""
Canonical Skyra Log Event Schema v1.0.0.
Pinned to JSON Schema Draft 2020-12 and Elastic Common Schema (ECS) 8.11.0.

NOTE: Auto-generated from contracts/schemas/v1/log-event.schema.json
Run \`pnpm run sync:schemas\` to synchronize or \`pnpm run check:schema-sync\` to verify.
"""

LOG_EVENT_SCHEMA_V1 = ${formattedJson}
`;
}

function run() {
  if (!fs.existsSync(CANONICAL_SCHEMA_PATH)) {
    console.error(`ERROR: Canonical schema not found at ${CANONICAL_SCHEMA_PATH}`);
    process.exit(1);
  }

  const rawSchema = fs.readFileSync(CANONICAL_SCHEMA_PATH, 'utf-8');
  let schemaObj;
  try {
    schemaObj = JSON.parse(rawSchema);
  } catch (err) {
    console.error(`ERROR: Failed to parse canonical JSON schema: ${err.message}`);
    process.exit(1);
  }

  const expectedTs = generateTsContent(schemaObj);
  const expectedPy = generatePyContent(schemaObj);

  if (isCheckOnly) {
    let hasDrift = false;

    if (!fs.existsSync(TS_SCHEMA_PATH)) {
      console.error(`[DRIFT] TypeScript schema file missing: ${TS_SCHEMA_PATH}`);
      hasDrift = true;
    } else {
      const actualTs = fs.readFileSync(TS_SCHEMA_PATH, 'utf-8');
      if (actualTs.trim() !== expectedTs.trim()) {
        console.error(`[DRIFT] TypeScript schema in ${TS_SCHEMA_PATH} has drifted from canonical schema!`);
        hasDrift = true;
      }
    }

    if (!fs.existsSync(PY_SCHEMA_PATH)) {
      console.error(`[DRIFT] Python schema file missing: ${PY_SCHEMA_PATH}`);
      hasDrift = true;
    } else {
      const actualPy = fs.readFileSync(PY_SCHEMA_PATH, 'utf-8');
      if (actualPy.trim() !== expectedPy.trim()) {
        console.error(`[DRIFT] Python schema in ${PY_SCHEMA_PATH} has drifted from canonical schema!`);
        hasDrift = true;
      }
    }

    if (hasDrift) {
      console.error('\nSchema synchronization check FAILED. Run `pnpm run sync:schemas` to update copies.');
      process.exit(1);
    }

    console.log('✔ Schema synchronization check PASSED. TypeScript and Python schemas match canonical v1.');
    process.exit(0);
  } else {
    fs.writeFileSync(TS_SCHEMA_PATH, expectedTs, 'utf-8');
    console.log(`✔ Synchronized TypeScript schema: ${path.relative(ROOT_DIR, TS_SCHEMA_PATH)}`);

    fs.writeFileSync(PY_SCHEMA_PATH, expectedPy, 'utf-8');
    console.log(`✔ Synchronized Python schema: ${path.relative(ROOT_DIR, PY_SCHEMA_PATH)}`);
  }
}

run();
