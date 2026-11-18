import { Injectable } from '@nestjs/common';
import type { IMembershipProvider } from '../domain/membership-provider.port.js';
import type { WorkspaceMembership } from '../domain/session.model.js';
import { BffConfigService } from '../../../config/bff-config.service.js';
import { MembershipProviderUnavailableException } from '../../../common/errors/bff.errors.js';
import { AdminClientService } from './admin-client.service.js';
@Injectable()
export class AuthoritativeMembershipAdapter implements IMembershipProvider {
  constructor(private readonly config: BffConfigService, private readonly admin?: AdminClientService) {}
  async resolveMemberships(userId: string, _email: string): Promise<WorkspaceMembership[]> {
    if (!this.config.useAuthoritativeMembership) throw new MembershipProviderUnavailableException(this.config.isProduction ? 'Authoritative membership backend is pending Gate B activation.' : 'Authoritative membership backend is disabled.');
    const result = await (this.admin ?? new AdminClientService(this.config)).request(userId, '', 'GET');
    if (!Array.isArray(result.data)) throw new MembershipProviderUnavailableException('Invalid authoritative membership response.');
    return result.data as WorkspaceMembership[];
  }
}
