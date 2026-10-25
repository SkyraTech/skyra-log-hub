import { Injectable, Inject, HttpStatus } from '@nestjs/common';
import { PROJECT_REPOSITORY, type IProjectRepository } from '../metadata/repositories/project.repository.interface.js';
import { QUOTA_REPOSITORY, type IQuotaRepository } from '../metadata/repositories/quota.repository.interface.js';
import { GatewayException } from '../common/types/gateway-exception.js';
import { ErrorCode } from '../common/types/error-code.enum.js';
import type { AuthenticatedIdentity } from '../auth/auth.types.js';
import type { ProjectEntity, ProjectQuotaEntity } from '../metadata/entities/metadata.entities.js';

@Injectable()
export class ProjectService {
  constructor(
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepo: IProjectRepository,
    @Inject(QUOTA_REPOSITORY)
    private readonly quotaRepo: IQuotaRepository,
  ) {}

  public async authorizeProjectAccess(
    projectId: string,
    environment: string,
    identity: AuthenticatedIdentity,
  ): Promise<{ project: ProjectEntity; quota: ProjectQuotaEntity | null }> {
    // 1. Check credential allowedProjects
    const hasProjectWildcard = identity.allowedProjects.includes('*');
    if (!hasProjectWildcard && !identity.allowedProjects.includes(projectId)) {
      throw new GatewayException(
        ErrorCode.PROJECT_ACCESS_DENIED,
        `Credential is not authorized for project "${projectId}"`,
        HttpStatus.FORBIDDEN,
      );
    }

    // 2. Check credential allowedEnvironments
    const hasEnvWildcard = identity.allowedEnvironments.includes('*');
    if (!hasEnvWildcard && !identity.allowedEnvironments.includes(environment)) {
      throw new GatewayException(
        ErrorCode.ENVIRONMENT_MISMATCH,
        `Credential is not authorized for environment "${environment}"`,
        HttpStatus.FORBIDDEN,
      );
    }

    // 3. Check project entity
    const project = await this.projectRepo.findById(projectId);
    if (!project) {
      throw new GatewayException(
        ErrorCode.PROJECT_ACCESS_DENIED,
        `Project "${projectId}" not found`,
        HttpStatus.FORBIDDEN,
      );
    }

    // 4. Cross-tenant check: project must belong to the credential's tenant
    if (project.tenantId !== identity.tenantId) {
      throw new GatewayException(
        ErrorCode.PROJECT_ACCESS_DENIED,
        `Cross-tenant access forbidden: project "${projectId}" does not belong to tenant "${identity.tenantId}"`,
        HttpStatus.FORBIDDEN,
      );
    }

    // 5. Project status check
    if (project.status !== 'ACTIVE') {
      throw new GatewayException(
        ErrorCode.PROJECT_ACCESS_DENIED,
        `Project "${project.name}" (${project.id}) is ${project.status}`,
        HttpStatus.FORBIDDEN,
      );
    }

    // 6. Fetch quota if configured
    const quota = await this.quotaRepo.findByProjectId(projectId);

    return { project, quota };
  }
}
