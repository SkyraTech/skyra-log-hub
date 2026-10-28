import {
  Controller,
  Post,
  Get,
  Param,
  Query,
  Body,
  Req,
  Res,
  UseGuards,
  Logger,
  HttpStatus,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { SessionAuthGuard } from '../../auth/guards/session-auth.guard.js';
import { CsrfGuard } from '../../auth/guards/csrf.guard.js';
import { QueryTokenService } from '../../auth/application/query-token.service.js';
import { BffConfigService } from '../../../config/bff-config.service.js';
import {
  InvalidArgumentException,
  UnauthorizedProjectException,
  UpstreamServiceException,
  UpstreamTimeoutException,
} from '../../../common/errors/bff.errors.js';

@Controller('bff/query')
@UseGuards(SessionAuthGuard)
export class QueryProxyController {
  private readonly logger = new Logger(QueryProxyController.name);

  constructor(
    private readonly config: BffConfigService,
    private readonly queryTokenService: QueryTokenService,
  ) {}

  @Post('search')
  @UseGuards(CsrfGuard)
  public async search(
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
    @Body() body: Record<string, unknown>,
  ): Promise<void> {
    const session = req.session!;
    const projectFromList = Array.isArray(body['projects']) && body['projects'].length > 0 ? (body['projects'][0] as string) : undefined;
    const tenantId = (body['tenantId'] as string) || session.activeTenantId;
    const projectId = (body['projectId'] as string) || projectFromList || session.activeProjectId;

    if (!tenantId || !projectId) {
      throw new InvalidArgumentException(
        'Both tenantId and projectId must be provided or set in active workspace context.',
      );
    }

    const scopedToken = this.queryTokenService.createScopedQueryToken(
      session,
      tenantId,
      projectId,
    );

    // Sanitize envelope keys to conform strictly with search-request.schema.json
    const { tenantId: _t, projectId: _p, ...cleanBody } = body;
    if (!cleanBody['projects']) {
      cleanBody['projects'] = [projectId];
    }

    const upstreamUrl = `${this.config.queryServiceUrl}/query/v1/logs/search`;
    await this.forwardRequest(req, reply, 'POST', upstreamUrl, scopedToken, cleanBody);
  }

  @Get('events/:eventId')
  public async getEvent(
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
    @Param('eventId') eventId: string,
    @Query('tenantId') queryTenantId: string | undefined,
    @Query('projectId') queryProjectId: string | undefined,
    @Query('timestamp') timestamp: string | undefined,
  ): Promise<void> {
    const session = req.session!;
    const tenantId = queryTenantId || session.activeTenantId;
    const projectId = queryProjectId || session.activeProjectId;

    if (!tenantId || !projectId) {
      throw new InvalidArgumentException(
        'Both tenantId and projectId must be provided or set in active workspace context.',
      );
    }

    const scopedToken = this.queryTokenService.createScopedQueryToken(
      session,
      tenantId,
      projectId,
    );

    const qs = new URLSearchParams();
    qs.set('projectId', projectId);
    if (timestamp) {
      const dateHint = timestamp.substring(0, 10);
      if (/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(dateHint)) {
        qs.set('date', dateHint);
      }
    }
    const queryString = `?${qs.toString()}`;

    const upstreamUrl = `${this.config.queryServiceUrl}/query/v1/logs/${encodeURIComponent(eventId)}${queryString}`;
    await this.forwardRequest(req, reply, 'GET', upstreamUrl, scopedToken);
  }

  @Post('aggregate')
  @UseGuards(CsrfGuard)
  public async aggregate(
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
    @Body() body: Record<string, unknown>,
  ): Promise<void> {
    const session = req.session!;
    const projectFromList = Array.isArray(body['projects']) && body['projects'].length > 0 ? (body['projects'][0] as string) : undefined;
    const tenantId = (body['tenantId'] as string) || session.activeTenantId;
    const projectId = (body['projectId'] as string) || projectFromList || session.activeProjectId;

    if (!tenantId || !projectId) {
      throw new InvalidArgumentException(
        'Both tenantId and projectId must be provided or set in active workspace context.',
      );
    }

    const scopedToken = this.queryTokenService.createScopedQueryToken(
      session,
      tenantId,
      projectId,
    );

    const { tenantId: _t, projectId: _p, ...cleanBody } = body;
    if (!cleanBody['projects']) {
      cleanBody['projects'] = [projectId];
    }

    const upstreamUrl = `${this.config.queryServiceUrl}/query/v1/logs/aggregate`;
    await this.forwardRequest(req, reply, 'POST', upstreamUrl, scopedToken, cleanBody);
  }

  @Post('facets')
  @UseGuards(CsrfGuard)
  public async facets(
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
    @Body() body: Record<string, unknown>,
  ): Promise<void> {
    const session = req.session!;
    const projectFromList = Array.isArray(body['projects']) && body['projects'].length > 0 ? (body['projects'][0] as string) : undefined;
    const tenantId = (body['tenantId'] as string) || session.activeTenantId;
    const projectId = (body['projectId'] as string) || projectFromList || session.activeProjectId;

    if (!tenantId || !projectId) {
      throw new InvalidArgumentException(
        'Both tenantId and projectId must be provided or set in active workspace context.',
      );
    }

    const scopedToken = this.queryTokenService.createScopedQueryToken(
      session,
      tenantId,
      projectId,
    );

    const { tenantId: _t, projectId: _p, ...cleanBody } = body;
    if (!cleanBody['projects']) {
      cleanBody['projects'] = [projectId];
    }

    const upstreamUrl = `${this.config.queryServiceUrl}/query/v1/logs/facets`;
    await this.forwardRequest(req, reply, 'POST', upstreamUrl, scopedToken, cleanBody);
  }

  private async forwardRequest(
    req: FastifyRequest,
    reply: FastifyReply,
    method: 'GET' | 'POST',
    upstreamUrl: string,
    scopedToken: string,
    body?: Record<string, unknown>,
  ): Promise<void> {
    const correlationId =
      (req.headers['x-correlation-id'] as string) ||
      (req.headers['x-request-id'] as string) ||
      `req_${Date.now()}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000); // 15-second budget

    // Propagate client cancellation
    req.raw.on('close', () => {
      controller.abort();
    });

    try {
      const upstreamRes = await fetch(upstreamUrl, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, application/problem+json',
          Authorization: `Bearer ${scopedToken}`,
          'X-Correlation-ID': correlationId,
          'X-Request-ID': correlationId,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const contentType = upstreamRes.headers.get('content-type') || 'application/json';
      const responseText = await upstreamRes.text();

      reply.status(upstreamRes.status).header('content-type', contentType).send(responseText);
    } catch (err: unknown) {
      clearTimeout(timeout);

      if (err instanceof Error && err.name === 'AbortError') {
        throw new UpstreamTimeoutException(
          'Upstream Query Service timed out while executing analytical query.',
        );
      }

      this.logger.error(`Upstream proxy request to ${upstreamUrl} failed: ${String(err)}`);
      throw new UpstreamServiceException(
        'Failed to connect to upstream Skyra LogHub Query Service.',
      );
    }
  }
}
