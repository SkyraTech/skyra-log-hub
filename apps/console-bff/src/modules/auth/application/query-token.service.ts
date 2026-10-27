import * as crypto from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { BffConfigService } from '../../../config/bff-config.service.js';
import type { BffSession } from '../domain/session.model.js';
import { UnauthorizedProjectException } from '../../../common/errors/bff.errors.js';

@Injectable()
export class QueryTokenService {
  constructor(private readonly config: BffConfigService) {}

  /**
   * Mints a short-lived (60s) internal JWT scoped strictly to the requested tenant
   * and project after verifying that the session user has authoritative membership.
   */
  public createScopedQueryToken(
    session: BffSession,
    tenantId: string,
    projectId: string,
  ): string {
    const tenantMembership = session.memberships.find((m) => m.tenantId === tenantId);
    if (!tenantMembership) {
      throw new UnauthorizedProjectException(
        `User does not belong to requested tenant "${tenantId}".`,
      );
    }

    const projectMembership = tenantMembership.projects.find((p) => p.projectId === projectId);
    if (!projectMembership) {
      throw new UnauthorizedProjectException(
        `User does not have authorized access to project "${projectId}" in tenant "${tenantId}".`,
      );
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const expSec = nowSec + 60; // 60 seconds token lifetime

    const header = {
      alg: 'HS256',
      typ: 'JWT',
    };

    // Map project roles to QueryRole ('viewer' | 'analyst' | 'admin')
    const mappedRoles = projectMembership.roles.filter((r) =>
      ['viewer', 'analyst', 'admin'].includes(r),
    );
    if (mappedRoles.length === 0) {
      mappedRoles.push('viewer');
    }

    const payload = {
      iss: this.config.queryServiceJwtIssuer,
      aud: this.config.queryServiceJwtAudience,
      sub: session.user.id,
      email: session.user.email,
      tenant_id: tenantId,
      authorized_projects: [projectId],
      allowed_environments: projectMembership.allowedEnvironments ?? [
        'production',
        'staging',
        'development',
      ],
      roles: mappedRoles,
      iat: nowSec,
      nbf: nowSec - 2,
      exp: expSec,
    };

    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const dataToSign = `${headerB64}.${payloadB64}`;

    const signature = crypto
      .createHmac('sha256', this.config.queryServiceJwtSecret)
      .update(dataToSign)
      .digest('base64url');

    return `${dataToSign}.${signature}`;
  }
}
