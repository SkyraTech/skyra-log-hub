import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AppConfigService } from '../../core/config/app-config.service';
import { AuthService } from '../../core/auth/auth.service';

export interface OrganizationView {
  id: string; code: string; name: string; status: string;
  createdAt: string; updatedAt: string; version: string; capabilities: string[];
}
@Injectable({ providedIn: 'root' })
export class OrganizationApiService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfigService);
  private readonly auth = inject(AuthService);
  private get url() { return `${this.config.config().adminApiBaseUrl}/bff/organization`; }
  read() { return this.http.get<OrganizationView>(this.url, { withCredentials: true }); }
  save(name: string, version: string) {
    return this.http.patch<OrganizationView>(this.url, { name }, { withCredentials: true,
      headers: { 'X-CSRF-Token': this.auth.csrfToken(), 'If-Match': version } });
  }
}
