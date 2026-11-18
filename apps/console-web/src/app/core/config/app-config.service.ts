import { Injectable, signal } from '@angular/core';

export interface AppConfig {
  advancedExplorer?: boolean;
  advancedAnalytics?: boolean;
  advancedAuditUsage?: boolean;
  queryApiBaseUrl: string;
  adminApiBaseUrl: string;
  environment: 'development' | 'staging' | 'production';
  previewMode: boolean;
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
    previewMode: true, // Enables UI design preview showcase during development
    version: '1.0.0'
  });

  readonly config = this._config.asReadonly();

  constructor() {
    const runtime = (globalThis as typeof globalThis & { __SKYRA_CONFIG__?: Partial<AppConfig> }).__SKYRA_CONFIG__;
    if (runtime) this.updateConfig(runtime);
  }

  updateConfig(partial: Partial<AppConfig>): void {
    this._config.update(current => ({ ...current, ...partial }));
  }
}
