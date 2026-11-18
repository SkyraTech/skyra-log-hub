import {validateAggregateRequest} from './aggregate-validation.js';
import {validateSearchRequest} from './search-validation.js';
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
    if(!body||typeof body!=='object'||Array.isArray(body))validateSearchRequest(body);
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

    // Authorize scope before inspecting full search filters; never forward an invalid envelope.
    body=validateSearchRequest(body);
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
    if(!body||typeof body!=='object'||Array.isArray(body))throw new InvalidArgumentException('Analytics body must be a JSON object.');
    const session = req.session!;
    const projectFromList = Array.isArray(body['projects']) && body['projects'].length > 0 ? (body['projects'][0] as string) : undefined;
    if(Object.hasOwn(body,'tenantId'))throw new InvalidArgumentException('Analytics tenant comes from the authenticated session.');
    const tenantId = session.activeTenantId;
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

    body=validateAggregateRequest(body);
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
    reply.header('Cache-Control','no-store').header('Pragma','no-cache');
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

      if(upstreamRes.status>=500){reply.status(upstreamRes.status===504?504:503).type('application/problem+json').send({type:'about:blank',title:'Log query unavailable',status:upstreamRes.status===504?504:503,detail:'The log query service is unavailable. Retry the search.'});return;}
      if(upstreamRes.ok&&upstreamUrl.includes('/logs/search')){const data=JSON.parse(responseText);if(!Array.isArray(data.events))throw new UpstreamServiceException('Invalid log query response.');const keys=['@timestamp','ecs.version','ecs','event','log','message','service','skyra','trace','correlation','span','http','url','client','user_agent','user','database','error','job','host','process','labels','tags'];const events=Array.isArray(data.events)?data.events.map((e:Record<string,unknown>)=>Object.fromEntries(Object.entries(e).filter(([key])=>keys.includes(key)))):[];reply.status(upstreamRes.status).type('application/json').send({events,pagination:data.pagination,statistics:data.statistics,scope:data.scope});return;}
      reply.status(upstreamRes.status).header('content-type', contentType).send(responseText);
    } catch (err: unknown) {
      clearTimeout(timeout);

      if (err instanceof Error && err.name === 'AbortError') {
        throw new UpstreamTimeoutException(
          'Upstream Query Service timed out while executing analytical query.',
        );
      }

      this.logger.error('Log query upstream request failed.');
      throw new UpstreamServiceException(
        'Failed to connect to upstream Skyra LogHub Query Service.',
      );
    }
  }
}
