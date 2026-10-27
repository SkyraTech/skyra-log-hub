import { Injectable } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ProblemDetails } from './problem-details.model';

@Injectable({
  providedIn: 'root'
})
export class ErrorParserService {
  parse(error: unknown): ProblemDetails {
    if (error instanceof HttpErrorResponse) {
      if (error.error && typeof error.error === 'object' && 'title' in error.error) {
        return {
          type: error.error.type || 'about:blank',
          title: error.error.title,
          status: error.status || error.error.status || 500,
          detail: error.error.detail || error.message,
          instance: error.error.instance,
          code: error.error.code,
          errors: error.error.errors
        };
      }

      switch (error.status) {
        case 0:
          return {
            type: 'https://skyra.internal/errors/network-unavailable',
            title: 'Network Unavailable',
            status: 0,
            detail: 'Unable to reach Skyra LogHub query services. Please verify network connectivity.'
          };
        case 401:
          return {
            type: 'https://skyra.internal/errors/unauthorized',
            title: 'Authentication Required',
            status: 401,
            detail: 'Your session has expired or is invalid. Please log in again.'
          };
        case 403:
          return {
            type: 'https://skyra.internal/errors/forbidden',
            title: 'Access Denied',
            status: 403,
            detail: 'You lack permissions to query one or more requested projects.'
          };
        case 404:
          return {
            type: 'https://skyra.internal/errors/not-found',
            title: 'Record Not Found',
            status: 404,
            detail: 'The requested log event or partition was not found.'
          };
        case 429:
          return {
            type: 'https://skyra.internal/errors/concurrency-limit',
            title: 'Rate Limit Exceeded',
            status: 429,
            detail: 'Tenant query concurrency budget exceeded. Please wait a moment before retrying.'
          };
        case 504:
          return {
            type: 'https://skyra.internal/errors/query-timeout',
            title: 'Query Timed Out',
            status: 504,
            detail: 'DuckDB query scan exceeded budget. Please narrow your time window.'
          };
        default:
          return {
            type: 'https://skyra.internal/errors/server-error',
            title: 'Server Error',
            status: error.status,
            detail: error.message || 'An unexpected backend error occurred.'
          };
      }
    }

    if (error instanceof Error) {
      return {
        type: 'https://skyra.internal/errors/client-exception',
        title: 'Application Error',
        status: 500,
        detail: error.message
      };
    }

    return {
      type: 'https://skyra.internal/errors/unknown',
      title: 'Unknown Error',
      status: 500,
      detail: 'An unclassified application error occurred.'
    };
  }
}
