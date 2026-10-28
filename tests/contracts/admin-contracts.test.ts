/**
 * Administration API Contract & Schema Verification Suite
 * Task: LOGHUB-ADMIN-001
 *
 * Verifies OpenAPI 3.1.0 administration specifications and JSON Schemas (Draft 2020-12)
 * for tenants, projects, memberships, credentials, quotas, retention, and audit events.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// @ts-ignore
import Ajv2020 from '../../packages/logger-core/node_modules/ajv/dist/2020.js';
// @ts-ignore
import addFormats from '../../packages/logger-core/node_modules/ajv-formats/dist/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ADMIN_CONTRACTS_DIR = path.resolve(__dirname, '../../contracts/admin/v1');

const ajv = new Ajv2020({
  allErrors: true,
  strict: false,
});
addFormats(ajv);

// Load Admin Schemas
const errorSchema = JSON.parse(
  fs.readFileSync(path.join(ADMIN_CONTRACTS_DIR, 'error.schema.json'), 'utf-8')
);
const tenantRequestSchema = JSON.parse(
  fs.readFileSync(path.join(ADMIN_CONTRACTS_DIR, 'tenant-request.schema.json'), 'utf-8')
);
const tenantResponseSchema = JSON.parse(
  fs.readFileSync(path.join(ADMIN_CONTRACTS_DIR, 'tenant-response.schema.json'), 'utf-8')
);
const projectRequestSchema = JSON.parse(
  fs.readFileSync(path.join(ADMIN_CONTRACTS_DIR, 'project-request.schema.json'), 'utf-8')
);
const projectResponseSchema = JSON.parse(
  fs.readFileSync(path.join(ADMIN_CONTRACTS_DIR, 'project-response.schema.json'), 'utf-8')
);
const membershipRequestSchema = JSON.parse(
  fs.readFileSync(path.join(ADMIN_CONTRACTS_DIR, 'membership-request.schema.json'), 'utf-8')
);
const membershipResponseSchema = JSON.parse(
  fs.readFileSync(path.join(ADMIN_CONTRACTS_DIR, 'membership-response.schema.json'), 'utf-8')
);
const credentialRequestSchema = JSON.parse(
  fs.readFileSync(path.join(ADMIN_CONTRACTS_DIR, 'credential-request.schema.json'), 'utf-8')
);
const credentialResponseSchema = JSON.parse(
  fs.readFileSync(path.join(ADMIN_CONTRACTS_DIR, 'credential-response.schema.json'), 'utf-8')
);
const credentialCreatedResponseSchema = JSON.parse(
  fs.readFileSync(path.join(ADMIN_CONTRACTS_DIR, 'credential-created-response.schema.json'), 'utf-8')
);
const quotaRequestSchema = JSON.parse(
  fs.readFileSync(path.join(ADMIN_CONTRACTS_DIR, 'quota-request.schema.json'), 'utf-8')
);
const quotaResponseSchema = JSON.parse(
  fs.readFileSync(path.join(ADMIN_CONTRACTS_DIR, 'quota-response.schema.json'), 'utf-8')
);
const retentionRequestSchema = JSON.parse(
  fs.readFileSync(path.join(ADMIN_CONTRACTS_DIR, 'retention-request.schema.json'), 'utf-8')
);
const retentionResponseSchema = JSON.parse(
  fs.readFileSync(path.join(ADMIN_CONTRACTS_DIR, 'retention-response.schema.json'), 'utf-8')
);
const auditEventsResponseSchema = JSON.parse(
  fs.readFileSync(path.join(ADMIN_CONTRACTS_DIR, 'audit-events-response.schema.json'), 'utf-8')
);

const validateError = ajv.compile(errorSchema);
const validateTenantReq = ajv.compile(tenantRequestSchema);
const validateTenantRes = ajv.compile(tenantResponseSchema);
const validateProjectReq = ajv.compile(projectRequestSchema);
const validateProjectRes = ajv.compile(projectResponseSchema);
const validateMembershipReq = ajv.compile(membershipRequestSchema);
const validateMembershipRes = ajv.compile(membershipResponseSchema);
const validateCredentialReq = ajv.compile(credentialRequestSchema);
const validateCredentialRes = ajv.compile(credentialResponseSchema);
const validateCredentialCreatedRes = ajv.compile(credentialCreatedResponseSchema);
const validateQuotaReq = ajv.compile(quotaRequestSchema);
const validateQuotaRes = ajv.compile(quotaResponseSchema);
const validateRetentionReq = ajv.compile(retentionRequestSchema);
const validateRetentionRes = ajv.compile(retentionResponseSchema);
const validateAuditEventsRes = ajv.compile(auditEventsResponseSchema);

describe('Administration API Contract & Schema Verification (LOGHUB-ADMIN-001)', () => {
  it('ADM-1: compiles all JSON Schema Draft 2020-12 specifications cleanly', () => {
    assert.strictEqual(typeof validateError, 'function');
    assert.strictEqual(typeof validateTenantReq, 'function');
    assert.strictEqual(typeof validateTenantRes, 'function');
    assert.strictEqual(typeof validateProjectReq, 'function');
    assert.strictEqual(typeof validateProjectRes, 'function');
    assert.strictEqual(typeof validateMembershipReq, 'function');
    assert.strictEqual(typeof validateMembershipRes, 'function');
    assert.strictEqual(typeof validateCredentialReq, 'function');
    assert.strictEqual(typeof validateCredentialRes, 'function');
    assert.strictEqual(typeof validateCredentialCreatedRes, 'function');
    assert.strictEqual(typeof validateQuotaReq, 'function');
    assert.strictEqual(typeof validateQuotaRes, 'function');
    assert.strictEqual(typeof validateRetentionReq, 'function');
    assert.strictEqual(typeof validateRetentionRes, 'function');
    assert.strictEqual(typeof validateAuditEventsRes, 'function');
  });

  it('ADM-2: validates conforming tenant update requests and responses', () => {
    const validReq = { name: 'Acme Enterprise', status: 'ACTIVE' };
    assert.ok(validateTenantReq(validReq));

    const validRes = {
      id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      code: 'skyra-internal',
      name: 'Skyra Internal Platform',
      status: 'ACTIVE',
      createdAt: '2026-10-28T00:00:00.000Z',
      updatedAt: '2026-10-28T00:00:00.000Z',
    };
    assert.ok(validateTenantRes(validRes));

    // Reject unknown properties
    assert.strictEqual(validateTenantReq({ name: 'Valid', unknownKey: true }), false);
  });

  it('ADM-3: validates project provisioning request and enforces kebab-case ID', () => {
    const validReq = { id: 'billing-gateway', name: 'Billing Gateway Service' };
    assert.ok(validateProjectReq(validReq));

    // Inverted or invalid kebab-case
    assert.strictEqual(validateProjectReq({ id: 'Billing_Gateway!', name: 'Invalid' }), false);

    const validRes = {
      id: 'billing-gateway',
      tenantId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      name: 'Billing Gateway Service',
      status: 'ACTIVE',
      createdAt: '2026-10-28T00:00:00.000Z',
      updatedAt: '2026-10-28T00:00:00.000Z',
    };
    assert.ok(validateProjectRes(validRes));
  });

  it('ADM-4: validates membership invite requests and role restrictions', () => {
    const validInvite = {
      email: 'alex@skyra-tech.com',
      role: 'Developer',
      projectIds: ['skyra-tech', 'billing'],
    };
    assert.ok(validateMembershipReq(validInvite));

    // Rejects invalid role
    assert.strictEqual(validateMembershipReq({ email: 'alex@skyra-tech.com', role: 'SuperGodAdmin' }), false);

    const validRes = {
      id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      tenantId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      userId: '4bf92f35-77b3-4da6-a3ce-929d0e0e4736',
      email: 'alex@skyra-tech.com',
      displayName: 'Alex Developer',
      role: 'Developer',
      status: 'ACTIVE',
      assignedProjects: ['skyra-tech'],
      createdAt: '2026-10-28T00:00:00.000Z',
    };
    assert.ok(validateMembershipRes(validRes));
  });

  it('ADM-5: enforces one-time secret pattern on credential responses', () => {
    const validReq = {
      description: 'Kubernetes Cluster Shippers',
      allowedProjects: ['skyra-tech'],
      allowedEnvironments: ['production', 'staging'],
      rateLimitPerMin: 1200,
      expiresInDays: 90,
    };
    assert.ok(validateCredentialReq(validReq));

    // Metadata response: MUST NOT have rawToken
    const validMetaRes = {
      id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      tenantId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      keyPrefix: 'skyra_live_7c9e6679',
      description: 'Vector Shipper Key',
      allowedProjects: ['skyra-tech'],
      allowedEnvironments: ['production'],
      rateLimitPerMin: 600,
      createdAt: '2026-10-28T00:00:00.000Z',
      expiresAt: '2027-01-28T00:00:00.000Z',
      isRevoked: false,
      lastUsedAt: null,
    };
    assert.ok(validateCredentialRes(validMetaRes));

    // Created response: MUST have valid rawToken matching prefix and length
    const validCreatedRes = {
      ...validMetaRes,
      rawToken: 'skyra_live_7c9e6679f42540dea44b0e7fc1f90ae7e268a731b8ef09214d039f67a1b2c3d4',
    };
    assert.ok(validateCredentialCreatedRes(validCreatedRes));

    // Rejects malformed rawToken
    assert.strictEqual(
      validateCredentialCreatedRes({ ...validMetaRes, rawToken: 'short_token' }),
      false
    );
  });

  it('ADM-6: validates project admission quota requests and bounds', () => {
    const validQuotaReq = {
      maxBatchSize: 1000,
      maxPayloadBytes: 10485760, // 10 MiB
      maxEventsPerSec: 10000,
    };
    assert.ok(validateQuotaReq(validQuotaReq));

    // Reject out-of-bounds batch size
    assert.strictEqual(validateQuotaReq({ maxBatchSize: 100000 }), false);

    const validQuotaRes = {
      id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      tenantId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      projectId: 'billing-gateway',
      maxBatchSize: 500,
      maxPayloadBytes: 5242880,
      maxEventsPerSec: 5000,
      updatedAt: '2026-10-28T00:00:00.000Z',
    };
    assert.ok(validateQuotaRes(validQuotaRes));
  });

  it('ADM-7: validates retention policy and RFC 7807 problem details', () => {
    const validRetentionReq = {
      retentionDays: 60,
      enableParquetPurge: true,
      isLegalHold: false,
    };
    assert.ok(validateRetentionReq(validRetentionReq));

    const validError = {
      type: 'https://errors.skyra-tech.com/admin/v1/LAST_OWNER_REMOVAL_BLOCKED',
      title: 'Last Owner Removal Blocked',
      status: 409,
      detail: 'Cannot remove sole OrgOwner.',
      code: 'LAST_OWNER_REMOVAL_BLOCKED',
      requestId: 'req-1234567890',
    };
    assert.ok(validateError(validError));

    // Rejects unallowlisted error code
    assert.strictEqual(validateError({ ...validError, code: 'UNREGISTERED_ERROR_CODE' }), false);
  });
});
