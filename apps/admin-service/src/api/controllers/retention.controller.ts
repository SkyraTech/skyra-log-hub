import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Req,
  Res,
  UseGuards,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';
import { TrustedAssertionGuard } from '../../core/security/trusted-assertion.guard.js';
import { AdminConfigService } from '../../core/config/admin-config.service.js';
import { RetentionService } from '../../modules/projects/retention.service.js';

@Controller('admin/v1')
@UseGuards(TrustedAssertionGuard)
export class RetentionController {
  constructor(
    private readonly service: RetentionService,
    private readonly config: AdminConfigService,
  ) {}

  private enabled(reply: FastifyReply) {
    if (!this.config.persistenceEnabled || !this.config.internalJwtConfigured) {
      throw new ServiceUnavailableException('Retention management is not activated.');
    }
    reply.header('Cache-Control', 'no-store').header('Pragma', 'no-cache');
  }

  private correlation(req: FastifyRequest, reply: FastifyReply): string {
    const input = req.headers['x-correlation-id'];
    const id = typeof input === 'string' && /^[a-zA-Z0-9-]{1,64}$/.test(input) ? input : randomUUID();
    reply.header('X-Correlation-ID', id);
    return id;
  }

  @Get('projects/:projectId/retention')
  async getRetention(
    @Param('projectId') projectId: string,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    this.enabled(reply);
    const tenantId = req.principal!.tenantId;
    return await this.service.read(req.principal!, tenantId, projectId);
  }

  @Patch('projects/:projectId/retention')
  async patchRetention(
    @Param('projectId') projectId: string,
    @Body() body: unknown,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    this.enabled(reply);
    const tenantId = req.principal!.tenantId;
    return await this.service.update(req.principal!, tenantId, projectId, body, this.correlation(req, reply));
  }

  @Get('tenants/:tenantId/projects/:projectId/retention')
  async getTenantRetention(
    @Param('tenantId') tenantId: string,
    @Param('projectId') projectId: string,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    this.enabled(reply);
    return await this.service.read(req.principal!, tenantId, projectId);
  }

  @Patch('tenants/:tenantId/projects/:projectId/retention')
  async patchTenantRetention(
    @Param('tenantId') tenantId: string,
    @Param('projectId') projectId: string,
    @Body() body: unknown,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    this.enabled(reply);
    return await this.service.update(req.principal!, tenantId, projectId, body, this.correlation(req, reply));
  }
}
