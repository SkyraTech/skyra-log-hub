import { Controller, Get, Patch, Param, Req, Res, Body, UseGuards, ServiceUnavailableException } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import { TrustedAssertionGuard } from '../../core/security/trusted-assertion.guard.js';
import { AdminConfigService } from '../../core/config/admin-config.service.js';
import { OrganizationService } from '../../modules/organization/organization.service.js';

@Controller('admin/v1')
@UseGuards(TrustedAssertionGuard)
export class OrganizationController {
  constructor(private readonly service: OrganizationService, private readonly config: AdminConfigService) {}
  private enabled() {
    if (!this.config.persistenceEnabled || !this.config.internalJwtConfigured) throw new ServiceUnavailableException('Authoritative administration is not activated.');
  }
  @Get('me/memberships')
  directory(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    this.enabled(); reply.header('Cache-Control', 'no-store');
    return this.service.directory(request.principal!);
  }
  @Get('tenants/:tenantId')
  async read(@Param('tenantId') tenantId: string, @Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    this.enabled();
    const result = await this.service.read(request.principal!, tenantId);
    reply.header('ETag', result.etag).header('X-Organization-Capabilities', result.capabilities.join(',')).header('Cache-Control', 'no-store');
    return result.tenant;
  }
  @Patch('tenants/:tenantId')
  async update(@Param('tenantId') tenantId: string, @Req() request: FastifyRequest, @Body() body: unknown, @Res({ passthrough: true }) reply: FastifyReply) {
    this.enabled();
    const input = request.headers['x-correlation-id'];
    const correlationId = typeof input === 'string' && /^[a-zA-Z0-9-]{1,64}$/.test(input) ? input : randomUUID();
    const result = await this.service.update(request.principal!, tenantId, body, request.headers['if-match'] as string|undefined, correlationId);
    reply.header('ETag', result.etag).header('X-Correlation-ID', correlationId).header('X-Organization-Capabilities', result.capabilities.join(',')).header('Cache-Control', 'no-store');
    return result.tenant;
  }
}
