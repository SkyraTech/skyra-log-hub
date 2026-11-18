import * as crypto from 'node:crypto';
import {
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  ServiceUnavailableException,
  UnauthorizedException,
  Body,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { BffConfigService } from '../../../config/bff-config.service.js';
import { OidcService } from '../application/oidc.service.js';
import { SessionStoreService } from '../application/session-store.service.js';
import { CsrfService } from '../application/csrf.service.js';
import { MembershipService } from '../application/membership.service.js';
import { SessionAuthGuard } from '../guards/session-auth.guard.js';
import { CsrfGuard } from '../guards/csrf.guard.js';
import {
  InvalidArgumentException,
  UnauthorizedProjectException,
} from '../../../common/errors/bff.errors.js';
import type { BffSession, SafeSessionDto } from '../domain/session.model.js';

@Controller('bff')
export class AuthController {
  constructor(
    private readonly config: BffConfigService,
    private readonly oidcService: OidcService,
    private readonly sessionStore: SessionStoreService,
    private readonly csrfService: CsrfService,
    private readonly membershipService: MembershipService,
  ) {}

  @Get('auth/readiness')
  public async readiness(){if(!await this.sessionStore.healthy())throw new ServiceUnavailableException('Session backend unavailable.');return {ready:true};}

  @Post('auth/rotate')
  @UseGuards(SessionAuthGuard,CsrfGuard)
  @HttpCode(HttpStatus.OK)
  public async rotateSession(@Req() req:FastifyRequest,@Res() reply:FastifyReply){
    const token=crypto.randomBytes(32).toString('hex'),csrf=this.csrfService.generateToken();
    const session=await this.sessionStore.rotate(req.session!.sessionId,token,csrf);
    if(!session)throw new UnauthorizedException('Session no longer active.');
    const remaining=Math.max(0,Math.floor(((session.absoluteExpiresAt?.getTime()??session.createdAt.getTime()+this.config.sessionAbsoluteLifetimeMs)-Date.now())/1000));
    reply.setCookie(this.config.sessionCookieName,token,{httpOnly:true,secure:this.config.cookieSecure,sameSite:this.config.cookieSameSite,path:'/',maxAge:remaining});
    if(this.config.sessionCookieName!=='skyra-session'&&!this.config.cookieSecure)reply.setCookie('skyra-session',token,{httpOnly:true,secure:false,sameSite:'lax',path:'/',maxAge:remaining});
    reply.send({success:true,csrfToken:csrf});
  }

  @Get('auth/login')
  public async login(
    @Query('returnUrl') returnUrl: string | undefined,
    @Query('redirect') redirect: string | undefined,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const safeReturnUrl = this.sanitizeReturnUrl(returnUrl);
    const binding=crypto.randomBytes(32).toString('hex');
    const authReq = await this.oidcService.createProviderAuthorizationRequest(safeReturnUrl,binding);
    reply.setCookie(this.config.isProduction?'__Host-skyra-oidc-binding':'skyra-oidc-binding',binding,{httpOnly:true,secure:this.config.cookieSecure,sameSite:'lax',path:'/',maxAge:600});

    if (redirect === 'false') {
      reply.send({
        authorizationUrl: authReq.authorizationUrl,
        state: authReq.state,
      });
      return;
    }

    reply.redirect(authReq.authorizationUrl, 302);
  }

  @Get('auth/callback')
  public async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Query('error_description') errorDescription: string | undefined,
    @Req() req:FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const { tokens, returnUrl } = await this.oidcService.handleCallback(
      code,
      state,
      error,
      errorDescription,
      (req.cookies as Record<string,string>|undefined)?.[this.config.isProduction?'__Host-skyra-oidc-binding':'skyra-oidc-binding'],
    );
    reply.clearCookie(this.config.isProduction?'__Host-skyra-oidc-binding':'skyra-oidc-binding',{path:'/'});

    // Resolve authoritative workspace memberships
    const memberships = await this.membershipService.resolveMemberships(
      tokens.user.id,
      tokens.user.email,
    );

    if(!memberships.length)throw new UnauthorizedException('No active organization membership.');

    // Pick initial active tenant and project if available
    const initialTenant = memberships[0];
    const initialProject = initialTenant?.projects[0];

    // Create secure session
    const priorCookies=req.cookies as Record<string,string>|undefined;
    const prior=priorCookies?.[this.config.sessionCookieName]||(!this.config.isProduction?priorCookies?.['skyra-session']:undefined);
    if(prior)await this.sessionStore.delete(prior);
    const sessionId = crypto.randomBytes(32).toString('hex');
    const csrfToken = this.csrfService.generateToken();
    const now = new Date();

    const session: BffSession = {
      sessionId,
      user: this.config.useAuthoritativeMembership ? { ...tokens.user, roles: initialTenant?.tenantRoles ?? [] } : tokens.user,
      memberships,
      createdAt: now,
      lastActivityAt: now,
      csrfToken,
      activeTenantId: initialTenant?.tenantId,
      activeProjectId: initialProject?.projectId,
    };

    await this.sessionStore.set(
      sessionId,
      session,
      this.config.sessionAbsoluteLifetimeMs,
    );

    // Set secure HTTP-only session cookie
    const cookieName = this.config.sessionCookieName;
    reply.setCookie(cookieName, sessionId, {
      httpOnly: true,
      secure: this.config.cookieSecure,
      sameSite: this.config.cookieSameSite,
      path: '/',
      maxAge: Math.floor(this.config.sessionAbsoluteLifetimeMs / 1000),
    });

    // Fallback cookie for local non-https development if using __Host- name
    if (cookieName !== 'skyra-session' && !this.config.cookieSecure) {
      reply.setCookie('skyra-session', sessionId, {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        path: '/',
        maxAge: Math.floor(this.config.sessionAbsoluteLifetimeMs / 1000),
      });
    }

    const destination = returnUrl && returnUrl.startsWith('/') ? returnUrl : '/';
    reply.redirect(destination, 302);
  }

  @Post('auth/logout')
  @UseGuards(SessionAuthGuard, CsrfGuard)
  @HttpCode(HttpStatus.OK)
  public async logout(
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const session = req.session;
    if (session) {
      await this.sessionStore.delete(session.sessionId);
    }

    const cookieName = this.config.sessionCookieName;
    reply.clearCookie(cookieName, { path: '/' });
    reply.clearCookie('skyra-session', { path: '/' });
    reply.clearCookie('__Host-skyra-session', { path: '/' });

    reply.send({ success: true, message: 'Session successfully revoked and cleared.',providerLogoutUrl:await this.oidcService.logoutUrl() });
  }

  @Get('session')
  @UseGuards(SessionAuthGuard)
  public getSession(@Req() req: FastifyRequest): SafeSessionDto {
    const session = req.session!;
    const activeTenant = session.memberships.find(
      (m) => m.tenantId === session.activeTenantId,
    );
    const availableProjects = activeTenant?.projects ?? [];

    const expiresAt = new Date(
      session.absoluteExpiresAt?.getTime() ?? session.createdAt.getTime() + this.config.sessionAbsoluteLifetimeMs,
    ).toISOString();
    const idleExpiresAt = new Date(
      session.idleExpiresAt?.getTime() ?? session.lastActivityAt.getTime() + this.config.sessionIdleTimeoutMs,
    ).toISOString();

    return {
      authenticated: true,
      user: session.user,
      activeTenantId: session.activeTenantId,
      activeProjectId: session.activeProjectId,
      availableTenants: session.memberships.map((m) => ({
        tenantId: m.tenantId,
        tenantName: m.tenantName,
      })),
      availableProjects,
      csrfToken: session.csrfToken,
      expiresAt,
      idleExpiresAt,
    };
  }

  @Get('me')
  @UseGuards(SessionAuthGuard)
  public getMe(@Req() req: FastifyRequest) {
    const session = req.session!;
    return {
      user: session.user,
      memberships: session.memberships,
      activeTenantId: session.activeTenantId,
      activeProjectId: session.activeProjectId,
    };
  }

  @Get('workspaces')
  @UseGuards(SessionAuthGuard)
  public getWorkspaces(@Req() req: FastifyRequest) {
    const session = req.session!;
    return {
      tenants: session.memberships,
      activeTenantId: session.activeTenantId,
      activeProjectId: session.activeProjectId,
    };
  }

  @Post('workspaces/select')
  @UseGuards(SessionAuthGuard, CsrfGuard)
  @HttpCode(HttpStatus.OK)
  public async selectWorkspace(
    @Req() req: FastifyRequest,
    @Body() body: { tenantId?: string; projectId?: string },
  ) {
    const session = req.session!;
    const { tenantId, projectId } = body;

    if (!tenantId) {
      throw new InvalidArgumentException('tenantId must be provided.');
    }

    const tenant = session.memberships.find((m) => m.tenantId === tenantId);
    if (!tenant) {
      throw new UnauthorizedProjectException(
        `User does not belong to requested tenant "${tenantId}".`,
      );
    }

    const project = tenant.projects.find((p) => p.projectId === projectId);
    if (projectId && !project) {
      throw new UnauthorizedProjectException(
        `User does not have access to project "${projectId}" under tenant "${tenantId}".`,
      );
    }

    session.activeTenantId = tenantId;
    session.activeProjectId = projectId;
    await this.sessionStore.updateContext(session.sessionId, session);

    return {
      success: true,
      activeTenantId: tenantId,
      activeProjectId: projectId,
      activeProject: project,
    };
  }

  @Get('csrf')
  @UseGuards(SessionAuthGuard)
  public getCsrfToken(@Req() req: FastifyRequest) {
    return { csrfToken: req.session!.csrfToken };
  }

  private sanitizeReturnUrl(returnUrl?: string): string | undefined {
    if (!returnUrl) return undefined;
    // Prevent open redirect vulnerabilities: only allow relative paths starting with /
    if (typeof returnUrl==='string' && returnUrl.length<=2048 && !/[\u0000-\u0020\u007f]/.test(returnUrl) && returnUrl.startsWith('/') && !returnUrl.startsWith('//') && !returnUrl.includes('\\')) {
      const parsed=new URL(returnUrl,'https://return.test.invalid');
      if(parsed.origin==='https://return.test.invalid')return parsed.pathname+parsed.search+parsed.hash;
    }
    return '/';
  }
}
