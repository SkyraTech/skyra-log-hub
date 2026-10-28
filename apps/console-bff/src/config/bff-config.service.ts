import { Injectable } from '@nestjs/common';
import type { BffConfig } from './bff-config.types.js';

@Injectable()
export class BffConfigService {
  private readonly config: BffConfig;

  constructor() {
    const nodeEnv = process.env['NODE_ENV'] ?? 'development';
    const isProduction = nodeEnv === 'production';

    const defaultOrigins = [
      'http://localhost:4200',
      'http://127.0.0.1:4200',
      'http://localhost:3200',
      'http://127.0.0.1:3200',
    ];
    const envOrigins = process.env['BFF_ALLOWED_ORIGINS']
      ? process.env['BFF_ALLOWED_ORIGINS'].split(',').map((o) => o.trim()).filter(Boolean)
      : defaultOrigins;

    this.config = {
      host: process.env['BFF_HOST'] ?? '127.0.0.1',
      port: parseInt(process.env['BFF_PORT'] ?? '3200', 10),
      nodeEnv,
      queryServiceUrl: process.env['QUERY_SERVICE_URL'] ?? 'http://127.0.0.1:3100',
      queryServiceJwtSecret:
        process.env['QUERY_SERVICE_JWT_SECRET'] ?? 'skyra-dev-query-insecure-secret-key-32chars',
      queryServiceJwtIssuer: process.env['QUERY_SERVICE_JWT_ISSUER'] ?? 'https://auth.skyra.internal',
      queryServiceJwtAudience: process.env['QUERY_SERVICE_JWT_AUDIENCE'] ?? 'skyra-loghub-query',
      // In production HTTPS, use __Host- prefix. In local dev HTTP, use skyra-session to comply with cookie RFCs
      sessionCookieName:
        process.env['SESSION_COOKIE_NAME'] ??
        (isProduction ? '__Host-skyra-session' : 'skyra-session'),
      sessionSecret:
        process.env['SESSION_SECRET'] ??
        'skyra-dev-session-secret-must-be-at-least-32-chars-long!',
      sessionIdleTimeoutMs: parseInt(
        process.env['SESSION_IDLE_TIMEOUT_MS'] ?? '1800000', // 30 minutes
        10,
      ),
      sessionAbsoluteLifetimeMs: parseInt(
        process.env['SESSION_ABSOLUTE_LIFETIME_MS'] ?? '28800000', // 8 hours
        10,
      ),
      cookieSecure: isProduction || process.env['COOKIE_SECURE'] === 'true',
      cookieSameSite: (process.env['COOKIE_SAME_SITE'] as 'lax' | 'strict') ?? 'lax',
      csrfSecret:
        process.env['CSRF_SECRET'] ?? 'skyra-dev-csrf-secret-key-at-least-32-chars!',
      allowedOrigins: envOrigins,
      oidcIssuerUrl: process.env['OIDC_ISSUER_URL'] ?? 'https://auth.skyra.dev',
      oidcClientId: process.env['OIDC_CLIENT_ID'] ?? 'skyra-console-bff',
      oidcClientSecret: process.env['OIDC_CLIENT_SECRET'] ?? 'skyra-oidc-client-secret',
      oidcRedirectUri:
        process.env['OIDC_REDIRECT_URI'] ?? 'http://127.0.0.1:3200/bff/auth/callback',
      oidcScopes: ['openid', 'profile', 'email'],
      mockOidcEnabled: !isProduction && process.env['ENABLE_MOCK_OIDC'] !== 'false',
      adminServiceUrl: process.env['ADMIN_SERVICE_URL'] ?? 'http://127.0.0.1:3300',
      useAuthoritativeMembership: process.env['BFF_USE_AUTHORITATIVE_MEMBERSHIP'] === 'true',
    };
  }

  get host(): string {
    return this.config.host;
  }

  get port(): number {
    return this.config.port;
  }

  get nodeEnv(): string {
    return this.config.nodeEnv;
  }

  get isProduction(): boolean {
    return this.config.nodeEnv === 'production';
  }

  get queryServiceUrl(): string {
    return this.config.queryServiceUrl;
  }

  get queryServiceJwtSecret(): string {
    return this.config.queryServiceJwtSecret;
  }

  get queryServiceJwtIssuer(): string {
    return this.config.queryServiceJwtIssuer;
  }

  get queryServiceJwtAudience(): string {
    return this.config.queryServiceJwtAudience;
  }

  get sessionCookieName(): string {
    return this.config.sessionCookieName;
  }

  get sessionSecret(): string {
    return this.config.sessionSecret;
  }

  get sessionIdleTimeoutMs(): number {
    return this.config.sessionIdleTimeoutMs;
  }

  get sessionAbsoluteLifetimeMs(): number {
    return this.config.sessionAbsoluteLifetimeMs;
  }

  get cookieSecure(): boolean {
    return this.config.cookieSecure;
  }

  get cookieSameSite(): 'lax' | 'strict' | 'none' {
    return this.config.cookieSameSite;
  }

  get csrfSecret(): string {
    return this.config.csrfSecret;
  }

  get allowedOrigins(): string[] {
    return [...this.config.allowedOrigins];
  }

  get oidcIssuerUrl(): string {
    return this.config.oidcIssuerUrl;
  }

  get oidcClientId(): string {
    return this.config.oidcClientId;
  }

  get oidcClientSecret(): string {
    return this.config.oidcClientSecret;
  }

  get oidcRedirectUri(): string {
    return this.config.oidcRedirectUri;
  }

  get oidcScopes(): string[] {
    return [...this.config.oidcScopes];
  }

  get mockOidcEnabled(): boolean {
    return this.config.mockOidcEnabled;
  }

  get adminServiceUrl(): string {
    return this.config.adminServiceUrl;
  }

  get useAuthoritativeMembership(): boolean {
    return this.config.useAuthoritativeMembership;
  }
}
