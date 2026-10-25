import { describe, it, beforeEach } from 'node:test';
import * as assert from 'node:assert/strict';
import { ProjectService } from '../../src/projects/project.service.js';
import { InMemoryProjectRepository } from '../../src/metadata/repositories/in-memory-project.repository.js';
import { InMemoryQuotaRepository } from '../../src/metadata/repositories/in-memory-quota.repository.js';
import { GatewayException } from '../../src/common/types/gateway-exception.js';
import { ErrorCode } from '../../src/common/types/error-code.enum.js';
import type { AuthenticatedIdentity } from '../../src/auth/auth.types.js';

describe('ProjectService Unit Tests', () => {
  let projectService: ProjectService;
  let projectRepo: InMemoryProjectRepository;
  let quotaRepo: InMemoryQuotaRepository;

  const tenantId = '00000000-0000-0000-0000-000000000001';
  const otherTenantId = '00000000-0000-0000-0000-000000000002';
  const projectId = 'skyra-tech';

  const validIdentity: AuthenticatedIdentity = {
    credentialId: 'cred-001',
    tenantId,
    allowedProjects: ['skyra-tech'],
    allowedEnvironments: ['production'],
    rateLimitPerMin: 600,
  };

  beforeEach(async () => {
    projectRepo = new InMemoryProjectRepository();
    quotaRepo = new InMemoryQuotaRepository();
    projectService = new ProjectService(projectRepo, quotaRepo);

    await projectRepo.save({
      id: projectId,
      tenantId,
      name: 'Skyra Tech Ingestion Platform',
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await quotaRepo.save({
      id: 'quota-001',
      tenantId,
      projectId,
      maxBatchSize: 200,
      maxPayloadBytes: 2097152,
      maxEventsPerSec: 1000,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  it('should authorize access to an allowed project and environment and return quota', async () => {
    const result = await projectService.authorizeProjectAccess(projectId, 'production', validIdentity);
    assert.equal(result.project.id, projectId);
    assert.equal(result.quota?.maxBatchSize, 200);
  });

  it('should reject credential unauthorized for project', async () => {
    await assert.rejects(
      async () => projectService.authorizeProjectAccess('unauthorized-project', 'production', validIdentity),
      (err: any) => {
        assert.ok(err instanceof GatewayException);
        assert.equal(err.code, ErrorCode.PROJECT_ACCESS_DENIED);
        return true;
      },
    );
  });

  it('should reject environment mismatch', async () => {
    await assert.rejects(
      async () => projectService.authorizeProjectAccess(projectId, 'staging', validIdentity),
      (err: any) => {
        assert.ok(err instanceof GatewayException);
        assert.equal(err.code, ErrorCode.ENVIRONMENT_MISMATCH);
        return true;
      },
    );
  });

  it('should reject cross-tenant project access', async () => {
    // Project exists, but belongs to other tenant
    await projectRepo.save({
      id: 'foreign-project',
      tenantId: otherTenantId,
      name: 'Foreign Project',
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const foreignIdentity: AuthenticatedIdentity = {
      credentialId: 'cred-foreign',
      tenantId, // current tenant
      allowedProjects: ['foreign-project'], // claiming access
      allowedEnvironments: ['production'],
      rateLimitPerMin: 600,
    };

    await assert.rejects(
      async () => projectService.authorizeProjectAccess('foreign-project', 'production', foreignIdentity),
      (err: any) => {
        assert.ok(err instanceof GatewayException);
        assert.equal(err.code, ErrorCode.PROJECT_ACCESS_DENIED);
        assert.match(err.message, /cross-tenant/i);
        return true;
      },
    );
  });

  it('should reject suspended project', async () => {
    await projectRepo.save({
      id: 'suspended-project',
      tenantId,
      name: 'Suspended Project',
      status: 'SUSPENDED',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const identity: AuthenticatedIdentity = {
      credentialId: 'cred-suspended',
      tenantId,
      allowedProjects: ['suspended-project'],
      allowedEnvironments: ['production'],
      rateLimitPerMin: 600,
    };

    await assert.rejects(
      async () => projectService.authorizeProjectAccess('suspended-project', 'production', identity),
      (err: any) => {
        assert.ok(err instanceof GatewayException);
        assert.equal(err.code, ErrorCode.PROJECT_ACCESS_DENIED);
        assert.match(err.message, /SUSPENDED/i);
        return true;
      },
    );
  });
});
