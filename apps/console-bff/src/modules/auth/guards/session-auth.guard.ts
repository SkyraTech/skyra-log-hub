import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { BffConfigService } from '../../../config/bff-config.service.js';
import { SessionStoreService } from '../application/session-store.service.js';
import {
  SessionExpiredException,
  UnauthorizedException,
} from '../../../common/errors/bff.errors.js';
import type { BffSession } from '../domain/session.model.js';

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
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();

    const cookieName = this.config.sessionCookieName;
    const cookies = (request.cookies ?? {}) as Record<string, string>;

    // Support both configured cookie name and fallback for dev environments
    const sessionId =
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

    // Touch session activity
    const nowTime = new Date();
    await this.sessionStore.touch(sessionId, nowTime);
    session.lastActivityAt = nowTime;

    request.session = session;
    return true;
  }
}
