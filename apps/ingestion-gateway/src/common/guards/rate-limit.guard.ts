import { Injectable, type CanActivate, type ExecutionContext, HttpStatus } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import type { AuthenticatedFastifyRequest } from '../../auth/auth.guard.js';
import { GatewayException } from '../types/gateway-exception.js';
import { ErrorCode } from '../types/error-code.enum.js';
import { DiagnosticsService } from '../../observability/diagnostics.service.js';

interface ClientWindow {
  timestamps: number[];
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly windows = new Map<string, ClientWindow>();
  private readonly windowMs = 60_000; // 1 minute sliding window

  constructor(private readonly diagnostics: DiagnosticsService) {}

  public canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedFastifyRequest>();
    const reply = context.switchToHttp().getResponse<FastifyReply>();

    const identity = request.skyraIdentity;
    if (!identity) {
      // If no authenticated identity exists yet, let auth guard handle it
      return true;
    }

    const key = identity.credentialId;
    const limit = identity.rateLimitPerMin > 0 ? identity.rateLimitPerMin : 600;
    const now = Date.now();

    let clientWindow = this.windows.get(key);
    if (!clientWindow) {
      clientWindow = { timestamps: [] };
      this.windows.set(key, clientWindow);
    }

    // Purge timestamps older than the window
    const cutoff = now - this.windowMs;
    clientWindow.timestamps = clientWindow.timestamps.filter((ts) => ts > cutoff);

    if (clientWindow.timestamps.length >= limit) {
      const oldest = clientWindow.timestamps[0] ?? now;
      const retryAfterSec = Math.max(1, Math.ceil((oldest + this.windowMs - now) / 1000));

      reply.header('Retry-After', retryAfterSec.toString());
      this.diagnostics.recordRateLimitHit(identity.credentialId);

      throw new GatewayException(
        ErrorCode.RATE_LIMIT_EXCEEDED,
        `Rate limit exceeded: maximum ${limit} requests per minute. Retry in ${retryAfterSec} seconds.`,
        HttpStatus.TOO_MANY_REQUESTS,
        {
          retryable: true,
          details: { limit, windowSeconds: 60, retryAfter: retryAfterSec },
        },
      );
    }

    clientWindow.timestamps.push(now);
    return true;
  }

  public resetForTesting(): void {
    this.windows.clear();
  }
}
