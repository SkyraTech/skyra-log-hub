import { Injectable, signal } from '@angular/core';
import type { UserProfile } from '../auth/auth.models';
import type { ProjectSummary, TenantSummary } from '../workspace/workspace.models';

export interface AppConfig {
  advancedExplorer?: boolean;
  advancedAnalytics?: boolean;
  advancedAuditUsage?: boolean;
  queryApiBaseUrl: string;
  adminApiBaseUrl: string;
  environment: 'development' | 'staging' | 'production';
  previewMode: boolean;
  /** Preview is allowed only when explicitly isolated from real service authority. */
  previewIsolation: boolean;
  /** Preview fixtures are supplied by an isolated runtime config, never by the production bundle. */
  previewUser?: UserProfile;
  previewWorkspace?: { tenant: TenantSummary; project: ProjectSummary; projects?: ProjectSummary[] };
  version: string;
}

@Injectable({
  providedIn: 'root'
})
export class AppConfigService {
  private readonly _config = signal<AppConfig>({
    queryApiBaseUrl: 'http://127.0.0.1:3100',
    adminApiBaseUrl: 'http://127.0.0.1:3200',
    environment: 'development',
    previewMode: false,
    previewIsolation: false,
    version: '1.0.0'
  });

  readonly config = this._config.asReadonly();

  constructor() {
    const runtime = (globalThis as typeof globalThis & { __SKYRA_CONFIG__?: Partial<AppConfig> }).__SKYRA_CONFIG__;
    if (runtime) this.updateConfig(runtime);
  }

  updateConfig(partial: Partial<AppConfig>): void {
    const next = { ...this._config(), ...partial };
    this.validate(next);
    this._config.set(next);
  }

  private validate(config: AppConfig): void {
    if (!['development', 'staging', 'production'].includes(config.environment)) {
      throw new Error('Invalid Console environment configuration.');
    }
    if (typeof config.previewMode !== 'boolean' || typeof config.previewIsolation !== 'boolean') {
      throw new Error('Preview configuration must use boolean values.');
    }
    if (config.previewMode && (!config.previewIsolation || config.environment !== 'development')) {
      throw new Error('Preview mode requires explicit isolated development configuration.');
    }
    if (config.previewIsolation && !config.previewMode) {
      throw new Error('Preview isolation cannot be enabled while preview mode is disabled.');
    }
    for (const key of ['queryApiBaseUrl', 'adminApiBaseUrl', 'version'] as const) {
      if (typeof config[key] !== 'string' || config[key].trim().length === 0) {
        throw new Error(`Invalid Console configuration value: ${key}.`);
      }
    }
  }
}
