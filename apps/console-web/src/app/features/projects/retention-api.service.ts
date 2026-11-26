import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AppConfigService } from '../../core/config/app-config.service';
import { AuthService } from '../../core/auth/auth.service';

export interface RetentionView {
  id: string;
  tenantId: string;
  projectId: string;
  retentionDays: number;
  enableParquetPurge: boolean;
  isLegalHold: boolean;
  updatedAt: string;
}

export interface RetentionUpdateRequest {
  retentionDays?: number;
  enableParquetPurge?: boolean;
  isLegalHold?: boolean;
}

@Injectable({ providedIn: 'root' })
export class RetentionApiService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfigService);
  private readonly auth = inject(AuthService);

  private url(projectId: string): string {
    return `${this.config.config().adminApiBaseUrl}/bff/projects/${encodeURIComponent(projectId)}/retention`;
  }

  getRetention(projectId: string) {
    return this.http.get<RetentionView>(this.url(projectId), { withCredentials: true });
  }

  updateRetention(projectId: string, body: RetentionUpdateRequest) {
    return this.http.patch<RetentionView>(this.url(projectId), body, {
      withCredentials: true,
      headers: { 'X-CSRF-Token': this.auth.csrfToken() },
    });
  }
}
