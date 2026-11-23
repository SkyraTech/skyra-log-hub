import { Injectable, Optional, Inject } from '@nestjs/common';

@Injectable()
export class AdminConfigService {
  public readonly dashboardPreferencesEnabled:boolean;
  public readonly savedSearchesEnabled:boolean;
  public readonly auditHistoryEnabled:boolean;
  public readonly advancedAuditUsageEnabled:boolean;
  public readonly quotaUsageEnabled:boolean;
  public readonly port: number;
  public readonly nodeEnv: string;
  public readonly trustedIssuers: string[];
  public readonly internalJwtSecret: string;
  public readonly internalJwtIssuer: string;
  public readonly internalJwtAudience: string;
  public readonly persistenceEnabled: boolean;
  public readonly databaseUrl?: string;
  public readonly internalJwtConfigured: boolean;

  constructor(@Optional() @Inject('ADMIN_ENV') env: Record<string, string | undefined> = process.env) {
    this.dashboardPreferencesEnabled=env['DASHBOARD_PREFERENCES_ENABLED']==='true';
    this.savedSearchesEnabled=env['SAVED_SEARCHES_ENABLED']==='true';
    this.auditHistoryEnabled=env['AUDIT_HISTORY_ENABLED']==='true';
    this.advancedAuditUsageEnabled=env['ADVANCED_AUDIT_USAGE_ENABLED']==='true';
    this.quotaUsageEnabled=env['QUOTA_USAGE_ENABLED']==='true';
    this.port = parseInt(env['PORT'] ?? '3300', 10);
    this.nodeEnv = env['NODE_ENV'] ?? 'development';
    if (!['development', 'test', 'production'].includes(this.nodeEnv)) {
      throw new Error('Invalid NODE_ENV. Expected development, test, or production.');
    }
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
    this.internalJwtConfigured = (env['INTERNAL_JWT_SECRET']?.length ?? 0) >= 32;
    if (this.isProduction && (!env['INTERNAL_JWT_SECRET'] || this.isPlaceholderSecret(this.internalJwtSecret))) {
      throw new Error('Production configuration requires a strong configured INTERNAL_JWT_SECRET.');
    }
  }

  public get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  public isIssuerTrusted(issuer: string): boolean {
    return this.trustedIssuers.includes(issuer);
  }

  private isPlaceholderSecret(value: string): boolean {
    const normalized = value.trim().toLowerCase();
    return normalized.length < 32 || [
      'skyra-internal-admin-shared-secret-key-32chars!',
      'change-me',
      'replace-me',
      'secret',
      'test-secret',
    ].includes(normalized) || /^(dev|development|test|example|default|change|replace)[-_ ]/i.test(normalized);
  }
}
