import { Injectable, signal } from '@angular/core';

export interface AppConfig {
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
    adminApiBaseUrl: 'http://127.0.0.1:3000',
    environment: 'development',
    previewMode: true, // Enables UI design preview showcase during development
    version: '1.0.0'
  });

  readonly config = this._config.asReadonly();

  updateConfig(partial: Partial<AppConfig>): void {
    this._config.update(current => ({ ...current, ...partial }));
  }
}
