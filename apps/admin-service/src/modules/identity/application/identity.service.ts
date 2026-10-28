import * as crypto from 'node:crypto';
import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  IDENTITY_REPOSITORY_PORT,
  type IIdentityRepositoryPort,
} from '../domain/identity.repository.port.js';
import type { UserIdentity, CreateUserDto, UserStatus } from '../domain/identity.model.js';
import { AdminConfigService } from '../../../core/config/admin-config.service.js';
import {
  InvalidIdentityAssertionException,
  IdentityNotFoundException,
  DisabledIdentityException,
} from '../../../core/errors/admin.errors.js';

@Injectable()
export class IdentityService {
  private readonly logger = new Logger(IdentityService.name);

  constructor(
    @Inject(IDENTITY_REPOSITORY_PORT)
    private readonly repo: IIdentityRepositoryPort,
    private readonly config: AdminConfigService,
  ) {}

  /**
   * Resolves a user by corporate OIDC (issuer, subject).
   * Enforces:
   * 1. Issuer trust validation.
   * 2. Existence verification.
   * 3. Identity status enforcement (rejects SUSPENDED or DEACTIVATED).
   */
  public async resolveIdentity(issuer: string, subject: string): Promise<UserIdentity> {
    if (!this.config.isIssuerTrusted(issuer)) {
      this.logger.warn(`Rejected untrusted identity issuer "${issuer}" for subject "${subject}".`);
      throw new InvalidIdentityAssertionException(
        `Untrusted OIDC issuer "${issuer}". Issuer is not in the approved corporate federation whitelist.`,
      );
    }

    const user = await this.repo.findByIssuerSubject(issuer, subject);
    if (!user) {
      throw new IdentityNotFoundException(
        `User identity not found for issuer "${issuer}" and subject "${subject}".`,
      );
    }

    if (user.status !== 'ACTIVE') {
      this.logger.warn(
        `Access denied for non-active identity: id="${user.id}", status="${user.status}", email="${user.email}".`,
      );
      throw new DisabledIdentityException(
        `User identity is currently "${user.status}". Access denied.`,
      );
    }

    return user;
  }

  /**
   * Provisions a new federated identity record.
   */
  public async provisionUser(dto: CreateUserDto): Promise<UserIdentity> {
    if (!this.config.isIssuerTrusted(dto.issuer)) {
      throw new InvalidIdentityAssertionException(
        `Untrusted OIDC issuer "${dto.issuer}". Issuer is not in the approved corporate federation whitelist.`,
      );
    }

    const existing = await this.repo.findByIssuerSubject(dto.issuer, dto.subject);
    if (existing) {
      return existing;
    }

    const now = new Date();
    const newUser: UserIdentity = {
      id: crypto.randomUUID(),
      issuer: dto.issuer,
      subject: dto.subject,
      email: dto.email.trim().toLowerCase(),
      displayName: dto.displayName.trim(),
      status: dto.status ?? 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    };

    return this.repo.save(newUser);
  }

  /**
   * Updates user lifecycle status.
   */
  public async updateUserStatus(id: string, status: UserStatus): Promise<UserIdentity> {
    const user = await this.repo.findById(id);
    if (!user) {
      throw new IdentityNotFoundException(`User with ID "${id}" not found.`);
    }

    user.status = status;
    user.updatedAt = new Date();
    return this.repo.save(user);
  }
}
