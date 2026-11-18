import { Injectable } from '@nestjs/common';
import type { BffConfig } from './bff-config.types.js';

@Injectable()
export class BffConfigService {
  readonly advancedAuditUsageEnabled=process.env['ADVANCED_AUDIT_USAGE_ENABLED']==='true';
  readonly advancedAnalyticsEnabled=process.env['ADVANCED_ANALYTICS_ENABLED']==='true';
  readonly advancedExplorerEnabled=process.env['ADVANCED_EXPLORER_ENABLED']==='true';
  readonly sessionStoreBackend=process.env['SESSION_STORE_BACKEND']??'postgres';
  readonly sessionDatabaseUrl=process.env['BFF_SESSION_DATABASE_URL']??'';
  readonly sessionDataKey=process.env['BFF_SESSION_DATA_KEY']??'';
  readonly oidcDiscoveryUrl=process.env['OIDC_DISCOVERY_URL']??'';
  readonly oidcTrustedOrigins=(process.env['OIDC_TRUSTED_ENDPOINT_ORIGINS']??'').split(',').map(v=>v.trim()).filter(Boolean);
  readonly oidcTenantId=process.env['OIDC_TENANT_ID']??'';
  readonly oidcLoopbackTest=process.env['NODE_ENV']==='test' && process.env['SKYRA_ISOLATED_TEST_ENV']==='true' && process.env['OIDC_ALLOW_LOOPBACK_TEST']==='true';
  readonly oidcPostLogoutRedirectUri=process.env['OIDC_POST_LOGOUT_REDIRECT_URI']??'';
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
    if(!this.config.mockOidcEnabled) {
      for(const key of ['OIDC_ISSUER_URL','OIDC_CLIENT_ID','OIDC_CLIENT_SECRET','OIDC_REDIRECT_URI','OIDC_DISCOVERY_URL','OIDC_TRUSTED_ENDPOINT_ORIGINS']) {
        if(!process.env[key]?.trim())throw new Error(`Real OIDC requires ${key}.`);
      }
      for(const value of [this.config.oidcIssuerUrl,this.oidcDiscoveryUrl,...this.oidcTrustedOrigins]) {
        const url=new URL(value);const local=this.oidcLoopbackTest && url.protocol==='http:' && url.hostname==='127.0.0.1';
        if((url.protocol!=='https:'&&!local)||url.username||url.password||url.search||url.hash)throw new Error('Invalid OIDC trust URL.');
      }
      if(this.config.oidcClientSecret.length<32)throw new Error('Real OIDC requires a strong OIDC_CLIENT_SECRET.');
      const callback=new URL(this.config.oidcRedirectUri);
      if((callback.protocol!=='https:' && !(callback.protocol==='http:' && ['127.0.0.1','localhost'].includes(callback.hostname) && !isProduction)) || callback.username || callback.password || callback.hash || callback.search)throw new Error('Invalid OIDC callback.');
      if(this.oidcPostLogoutRedirectUri){const logout=new URL(this.oidcPostLogoutRedirectUri);if(!envOrigins.includes(logout.origin)||logout.username||logout.password||logout.hash||logout.search||(logout.protocol!=='https:'&&!(logout.protocol==='http:'&&!isProduction&&['127.0.0.1','localhost'].includes(logout.hostname))))throw new Error('Invalid logout redirect.');}
      if(this.oidcTrustedOrigins.some(v=>new URL(v).origin!==v))throw new Error('OIDC trusted endpoints must be exact origins.');
      if(!this.oidcLoopbackTest && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(this.oidcTenantId))throw new Error('Real Entra requires OIDC_TENANT_ID.');
    }
    // Fixture authorization is only allowed by the isolated test harness. Protected
    // activation must explicitly configure its trust roots and session keys.
    if (this.config.useAuthoritativeMembership && nodeEnv !== 'test') {
      if (this.config.mockOidcEnabled) throw new Error('Authoritative membership requires real OIDC.');
      for (const key of ['OIDC_ISSUER_URL', 'OIDC_CLIENT_ID', 'OIDC_REDIRECT_URI', 'ADMIN_SERVICE_URL', 'BFF_ALLOWED_ORIGINS']) {
        if (!process.env[key]?.trim()) throw new Error(`Authoritative membership requires ${key}.`);
      }
      for (const key of ['OIDC_CLIENT_SECRET', 'INTERNAL_JWT_SECRET', 'SESSION_SECRET', 'CSRF_SECRET']) {
        if ((process.env[key]?.length ?? 0) < 32) throw new Error(`Authoritative membership requires a strong configured ${key}.`);
      }
      const issuer = new URL(this.config.oidcIssuerUrl);
      if (issuer.protocol !== 'https:' || issuer.username || issuer.password || issuer.search || issuer.hash) {
        throw new Error('OIDC issuer must be a fixed HTTPS URL without credentials, query, or fragment.');
      }
      for (const value of [this.config.oidcRedirectUri, this.config.adminServiceUrl, ...envOrigins]) {
        const url = new URL(value);
        const localHttp = !isProduction && url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
        if ((url.protocol !== 'https:' && !localHttp) || url.username || url.password || url.hash) throw new Error('Invalid activation endpoint or origin.');
      }
      if (!['lax', 'strict'].includes(this.config.cookieSameSite) ||
          !Number.isFinite(this.config.sessionIdleTimeoutMs) || this.config.sessionIdleTimeoutMs <= 0 ||
          !Number.isFinite(this.config.sessionAbsoluteLifetimeMs) || this.config.sessionAbsoluteLifetimeMs < this.config.sessionIdleTimeoutMs) {
        throw new Error('Invalid session security configuration.');
      }
    }
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
