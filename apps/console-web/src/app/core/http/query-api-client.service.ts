import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AppConfigService } from '../config/app-config.service';
import { AuthService } from '../auth/auth.service';
import {
  IQueryApiClient,
  SearchLogsRequest,
  SearchLogsResponse,
  CanonicalLogEvent,
  AggregateLogsRequest,
  AggregateLogsResponse,
  GetLogFacetsRequest,
  GetLogFacetsResponse
} from './api-client.port';

@Injectable({
  providedIn: 'root'
})
export class QueryApiClientService implements IQueryApiClient {
  private readonly http = inject(HttpClient);
  private readonly configService = inject(AppConfigService);
  private readonly authService = inject(AuthService, { optional: true });

  private get baseUrl(): string {
    // If adminApiBaseUrl is set, route through BFF query proxy; otherwise fallback
    const bffUrl = this.configService.config().adminApiBaseUrl;
    if (bffUrl) {
      return `${bffUrl}/bff/query`;
    }
    return `${this.configService.config().queryApiBaseUrl}/query/v1/logs`;
  }

  private getRequestOptions(extraHeaders: Record<string, string> = {}) {
    const csrf = this.authService?.csrfToken() || '';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...extraHeaders,
    };
    if (csrf) {
      headers['X-CSRF-Token'] = csrf;
    }
    return {
      headers: new HttpHeaders(headers),
      withCredentials: true,
    };
  }

  searchLogs(request: SearchLogsRequest): Observable<SearchLogsResponse> {
    const isBff = this.baseUrl.includes('/bff/query');
    const url = isBff ? `${this.baseUrl}/search` : `${this.baseUrl}/search`;
    return this.http.post<SearchLogsResponse>(url, request, this.getRequestOptions());
  }

  getLogEventById(eventId: string, projectId: string, dateHint?: string): Observable<CanonicalLogEvent> {
    const isBff = this.baseUrl.includes('/bff/query');
    const url = isBff
      ? `${this.baseUrl}/events/${encodeURIComponent(eventId)}`
      : `${this.baseUrl}/${encodeURIComponent(eventId)}`;

    let params = new HttpParams().set('projectId', projectId);
    if (dateHint) {
      params = params.set('timestamp', dateHint);
      params = params.set('date', dateHint);
    }
    return this.http.get<CanonicalLogEvent>(url, {
      ...this.getRequestOptions(),
      params,
    });
  }

  aggregateLogs(request: AggregateLogsRequest): Observable<AggregateLogsResponse> {
    const isBff = this.baseUrl.includes('/bff/query');
    const url = isBff ? `${this.baseUrl}/aggregate` : `${this.baseUrl}/aggregate`;
    return this.http.post<AggregateLogsResponse>(url, request, this.getRequestOptions());
  }

  getLogFacets(request: GetLogFacetsRequest): Observable<GetLogFacetsResponse> {
    const isBff = this.baseUrl.includes('/bff/query');
    const url = isBff ? `${this.baseUrl}/facets` : `${this.baseUrl}/facets`;
    return this.http.post<GetLogFacetsResponse>(url, request, this.getRequestOptions());
  }
}
