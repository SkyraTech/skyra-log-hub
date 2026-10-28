import { Injectable, Logger } from '@nestjs/common';
import { IdentityService } from '../../identity/application/identity.service.js';
import { MembershipService } from '../../membership/application/membership.service.js';
import {
  MEMBERSHIP_REPOSITORY_PORT,
  type IMembershipRepositoryPort,
} from '../../membership/domain/membership.repository.port.js';
import { Inject } from '@nestjs/common';
import { OptimisticLockConflictException } from '../../../core/errors/admin.errors.js';

export interface BootstrapTenantDto {
  tenantId: string;
  tenantName: string;
  initialOwnerIssuer: string;
  initialOwnerSubject: string;
  initialOwnerEmail: string;
  initialOwnerDisplayName: string;
}

@Injectable()
export class BootstrapService {
  private readonly logger = new Logger(BootstrapService.name);

  constructor(
    private readonly identityService: IdentityService,
    private readonly membershipService: MembershipService,
    @Inject(MEMBERSHIP_REPOSITORY_PORT)
    private readonly membershipRepo: IMembershipRepositoryPort,
  ) {}

  /**
   * Idempotent, auditable bootstrap of the initial tenant owner.
   * If the tenant already has an active OrgOwner, further bootstrap invocations are rejected.
   */
  public async bootstrapTenantOwner(dto: BootstrapTenantDto) {
    const existingOwners = await this.membershipRepo.countTenantOwners(dto.tenantId);
    if (existingOwners > 0) {
      this.logger.warn(`Rejected bootstrap attempt: tenant "${dto.tenantId}" already has ${existingOwners} active OrgOwner(s).`);
      throw new OptimisticLockConflictException(
        `Tenant "${dto.tenantId}" is already bootstrapped with an active OrgOwner. Repeat bootstrap is prohibited.`,
      );
    }

    // 1. Provision user identity
    const user = await this.identityService.provisionUser({
      issuer: dto.initialOwnerIssuer,
      subject: dto.initialOwnerSubject,
      email: dto.initialOwnerEmail,
      displayName: dto.initialOwnerDisplayName,
      status: 'ACTIVE',
    });

    // 2. Assign OrgOwner role (creates tenant membership automatically)
    const assignment = await this.membershipService.assignRole(
      user.id,
      user.email,
      dto.tenantId,
      user.id,
      'OrgOwner',
      null,
    );

    this.logger.log(`Successfully bootstrapped tenant "${dto.tenantId}" with initial OrgOwner "${user.email}".`);
    return {
      tenantId: dto.tenantId,
      ownerUserId: user.id,
      ownerEmail: user.email,
      assignmentId: assignment.id,
    };
  }
}
