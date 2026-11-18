import { Controller, Get, Patch, Body, Req, Res, UseGuards, ForbiddenException, BadGatewayException } from '@nestjs/common';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';
import { SessionAuthGuard } from '../guards/session-auth.guard.js';
import { CsrfGuard } from '../guards/csrf.guard.js';
import { AdminClientService } from '../application/admin-client.service.js';

@Controller('bff/organization')
@UseGuards(SessionAuthGuard, CsrfGuard)
export class OrganizationController {
  constructor(private readonly admin: AdminClientService) {}
  private async forward(request: FastifyRequest, reply: FastifyReply, method: 'GET'|'PATCH', body?: unknown) {
    const session = request.session!;
    const tenant = session.activeTenantId;
    if (!tenant || !session.memberships.some(m => m.tenantId === tenant)) throw new ForbiddenException('Select an authorized organization.');
    const input = request.headers['x-correlation-id'];
    const correlationId = typeof input === 'string' && /^[a-zA-Z0-9-]{1,64}$/.test(input) ? input : randomUUID();
    const result = await this.admin.request(session.user.id, tenant, method, body, request.headers['if-match'] as string|undefined, correlationId);
    const data = result.data as Record<string, unknown>;
    if (!data || data['id'] !== tenant || !['code','name','status','createdAt','updatedAt'].every(key => typeof data[key] === 'string') || !/^"o[0-9a-f-]{36}:\d+"$/i.test(result.etag ?? '') || !result.etag?.startsWith(`"o${tenant}:`)) {
      throw new BadGatewayException('Invalid organization response.');
    }
    // Project only public organization metadata; never forward upstream credentials or principal.
    reply.header('Cache-Control','no-store').header('X-Correlation-ID',correlationId);
    return { id: data['id'], code: data['code'], name: data['name'], status: data['status'],
      createdAt: data['createdAt'], updatedAt: data['updatedAt'], version: result.etag, capabilities: result.capabilities };
  }
  @Get() read(@Req() req: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) { return this.forward(req, reply, 'GET'); }
  @Patch() update(@Req() req: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply, @Body() body: unknown) { return this.forward(req, reply, 'PATCH', body); }
}
