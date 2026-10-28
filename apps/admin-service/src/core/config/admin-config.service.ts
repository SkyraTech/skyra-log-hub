import { Injectable } from '@nestjs/common';

@Injectable()
export class AdminConfigService {
  public readonly port: number;
  public readonly nodeEnv: string;
  public readonly trustedIssuers: string[];
  public readonly internalJwtSecret: string;
  public readonly internalJwtIssuer: string;
  public readonly internalJwtAudience: string;
  public readonly persistenceEnabled: boolean;
  public readonly databaseUrl?: string;

  constructor(env: Record<string, string | undefined> = process.env) {
    this.port = parseInt(env['PORT'] ?? '3300', 10);
    this.nodeEnv = env['NODE_ENV'] ?? 'development';
    this.trustedIssuers = (env['TRUSTED_OIDC_ISSUERS'] ?? 'https://accounts.google.com,https://auth.skyra.internal,https://login.microsoftonline.com')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    this.internalJwtSecret = env['INTERNAL_JWT_SECRET'] ?? 'skyra-internal-admin-shared-secret-key-32chars!';
    this.internalJwtIssuer = env['INTERNAL_JWT_ISSUER'] ?? 'https://auth.skyra.internal';
    this.internalJwtAudience = env['INTERNAL_JWT_AUDIENCE'] ?? 'skyra-admin-service';
    // GATE A SAFETY INVARIANT: Live database persistence is disabled by default
    this.persistenceEnabled = env['ADMIN_PERSISTENCE_ENABLED'] === 'true';
    this.databaseUrl = env['DATABASE_URL'];
  }

  public get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  public isIssuerTrusted(issuer: string): boolean {
    return this.trustedIssuers.includes(issuer);
  }
}
