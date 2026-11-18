import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  Optional,
  ServiceUnavailableException,
  HttpException,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { BffConfigService } from '../../../config/bff-config.service.js';
import { SessionStoreService } from '../application/session-store.service.js';
import {
  SessionExpiredException,
  UnauthorizedException,
} from '../../../common/errors/bff.errors.js';
import type { BffSession } from '../domain/session.model.js';
import {MembershipService} from '../application/membership.service.js';

declare module 'fastify' {
  interface FastifyRequest {
    session?: BffSession;
  }
}

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly config: BffConfigService,
    private readonly sessionStore: SessionStoreService,
    @Optional() private readonly memberships?:MembershipService,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    return this.authenticate(context.switchToHttp().getRequest<FastifyRequest>());
  }

  public async authenticate(request:FastifyRequest):Promise<boolean> {

    const cookieName = this.config.sessionCookieName;
    const cookies = (request.cookies ?? {}) as Record<string, string>;

    // Support both configured cookie name and fallback for dev environments
    const sessionId = this.config.isProduction ? cookies[cookieName] :
      cookies[cookieName] ||
      cookies['__Host-skyra-session'] ||
      cookies['skyra-session'];

    if (!sessionId) {
      throw new UnauthorizedException('No active session cookie provided.');
    }

    const session = await this.sessionStore.get(sessionId);
    if (!session) {
      throw new UnauthorizedException('Session is invalid or has been revoked.');
    }

    const now = Date.now();
    const createdMs = session.createdAt.getTime();
    const lastActivityMs = session.lastActivityAt.getTime();

    // Check absolute lifetime
    if (now - createdMs > this.config.sessionAbsoluteLifetimeMs) {
      await this.sessionStore.delete(sessionId);
      throw new SessionExpiredException('Session exceeded maximum absolute lifetime.');
    }

    // Check idle timeout
    if (now - lastActivityMs > this.config.sessionIdleTimeoutMs) {
      await this.sessionStore.delete(sessionId);
      throw new SessionExpiredException('Session expired due to user inactivity.');
    }

    // Query assertions and workspace selection must not reuse role grants cached
    // before a membership change. Organization/member APIs revalidate in Admin.
    const pathname=(request.url??'').split('?')[0]!;
    if(this.config.useAuthoritativeMembership){
      if(!this.memberships)throw new ServiceUnavailableException('Authoritative membership revalidation unavailable.');
      try{session.memberships=await this.memberships.resolveMemberships(session.user.id,session.user.email);}
      catch(error){if(error instanceof HttpException&&[401,403].includes(error.getStatus())){await this.sessionStore.delete(sessionId);throw new UnauthorizedException('Identity is no longer authorized.');}throw error;}
      const active=session.memberships.find(m=>m.tenantId===session.activeTenantId);
      if(!active){session.activeTenantId=undefined;session.activeProjectId=undefined;session.user.roles=[];}
      else{session.user.roles=active.tenantRoles??[];if(!active.projects.some(p=>p.projectId===session.activeProjectId))session.activeProjectId=undefined;}
    }
    if(this.config.useAuthoritativeMembership&&!session.memberships.length){await this.sessionStore.delete(sessionId);throw new UnauthorizedException('No active organization membership.');}
    // Touch session activity
    const nowTime = new Date();
    if(!await this.sessionStore.touch(sessionId, nowTime))throw new UnauthorizedException('Session is no longer active.');
    session.lastActivityAt = nowTime;
    session.idleExpiresAt=new Date(Math.min(session.absoluteExpiresAt?.getTime()??createdMs+this.config.sessionAbsoluteLifetimeMs,nowTime.getTime()+this.config.sessionIdleTimeoutMs));

    request.session = session;
    return true;
  }
}
