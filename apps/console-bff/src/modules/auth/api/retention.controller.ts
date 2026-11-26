import { Controller, Get, Patch, Param, Body, Req, Res, UseGuards, ForbiddenException, BadRequestException, BadGatewayException } from '@nestjs/common';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';
import { SessionAuthGuard } from '../guards/session-auth.guard.js';
import { CsrfGuard } from '../guards/csrf.guard.js';
import { AdminClientService } from '../application/admin-client.service.js';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export function publicRetention(raw: unknown, tenantId: string, projectId: string) {
  const d = raw as Record<string, any>;
  if (
    !d ||
    typeof d !== 'object' ||
    typeof d.id !== 'string' ||
    !uuid.test(d.id) ||
    d.tenantId !== tenantId ||
    d.projectId !== projectId ||
    typeof d.retentionDays !== 'number' ||
    !Number.isInteger(d.retentionDays) ||
    d.retentionDays < 1 ||
    d.retentionDays > 365 ||
    typeof d.enableParquetPurge !== 'boolean' ||
    typeof d.isLegalHold !== 'boolean' ||
    typeof d.updatedAt !== 'string' ||
    !Number.isFinite(Date.parse(d.updatedAt))
  ) {
    throw new BadGatewayException('Invalid retention response.');
  }
  return {
    id: d.id,
    tenantId: d.tenantId,
    projectId: d.projectId,
    retentionDays: d.retentionDays,
    enableParquetPurge: d.enableParquetPurge,
    isLegalHold: d.isLegalHold,
    updatedAt: d.updatedAt,
  };
}

@Controller('bff/projects/:projectId/retention')
@UseGuards(SessionAuthGuard, CsrfGuard)
export class RetentionController {
  constructor(private readonly admin: AdminClientService) {}

  @Get()
  async getRetention(
    @Param('projectId') project: string,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const session = req.session!;
    const tenant = session.activeTenantId;
    if (!tenant || !session.memberships.some((m) => m.tenantId === tenant)) {
      throw new ForbiddenException('Select an authorized organization.');
    }
    const input = req.headers['x-correlation-id'];
    const correlation = typeof input === 'string' && /^[a-zA-Z0-9-]{1,64}$/.test(input) ? input : randomUUID();
    reply.header('Cache-Control', 'no-store').header('Pragma', 'no-cache').header('X-Correlation-ID', correlation);

    const result = await this.admin.requestRetention(session.user.id, tenant, project, 'GET', undefined, correlation);
    return publicRetention(result.data, tenant, project);
  }

  @Patch()
  async patchRetention(
    @Param('projectId') project: string,
    @Body() body: unknown,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const session = req.session!;
    const tenant = session.activeTenantId;
    if (!tenant || !session.memberships.some((m) => m.tenantId === tenant)) {
      throw new ForbiddenException('Select an authorized organization.');
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('Invalid retention update payload.');
    }
    const input = req.headers['x-correlation-id'];
    const correlation = typeof input === 'string' && /^[a-zA-Z0-9-]{1,64}$/.test(input) ? input : randomUUID();
    reply.header('Cache-Control', 'no-store').header('Pragma', 'no-cache').header('X-Correlation-ID', correlation);

    const result = await this.admin.requestRetention(session.user.id, tenant, project, 'PATCH', body, correlation);
    return publicRetention(result.data, tenant, project);
  }
}
