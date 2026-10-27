import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AppConfigService } from '../config/app-config.service';
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

  private get baseUrl(): string {
    return this.configService.config().queryApiBaseUrl;
  }

  searchLogs(request: SearchLogsRequest): Observable<SearchLogsResponse> {
    const url = `${this.baseUrl}/query/v1/logs/search`;
    return this.http.post<SearchLogsResponse>(url, request);
  }

  getLogEventById(eventId: string, projectId: string, dateHint?: string): Observable<CanonicalLogEvent> {
    const url = `${this.baseUrl}/query/v1/logs/${encodeURIComponent(eventId)}`;
    let params = new HttpParams().set('projectId', projectId);
    if (dateHint) {
      params = params.set('date', dateHint);
    }
    return this.http.get<CanonicalLogEvent>(url, { params });
  }

  aggregateLogs(request: AggregateLogsRequest): Observable<AggregateLogsResponse> {
    const url = `${this.baseUrl}/query/v1/logs/aggregate`;
    return this.http.post<AggregateLogsResponse>(url, request);
  }

  getLogFacets(request: GetLogFacetsRequest): Observable<GetLogFacetsResponse> {
    const url = `${this.baseUrl}/query/v1/logs/facets`;
    return this.http.post<GetLogFacetsResponse>(url, request);
  }
}
