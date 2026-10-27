import '@angular/compiler';
import 'zone.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { HttpErrorResponse } from '@angular/common/http';
import { ErrorParserService } from '../src/app/core/errors/error-parser.service';
import { ProblemDetails } from '../src/app/core/errors/problem-details.model';

describe('ErrorParserService — RFC 7807 Problem Details Normalization', () => {
  const parser = new ErrorParserService();

  it('should parse an RFC 7807 Problem Details object from HttpErrorResponse', () => {
    const httpError = new HttpErrorResponse({
      status: 400,
      error: {
        type: 'https://skyra.io/errors/invalid-query-range',
        title: 'Invalid Query Time Range',
        status: 400,
        detail: 'The requested start timestamp is older than the 30-day retention boundary.',
        instance: '/v1/logs/search',
        code: 'ERR_QUERY_OUT_OF_BOUNDS',
      },
    });

    const problem: ProblemDetails = parser.parse(httpError);
    assert.equal(problem.status, 400);
    assert.equal(problem.title, 'Invalid Query Time Range');
    assert.equal(problem.detail, 'The requested start timestamp is older than the 30-day retention boundary.');
    assert.equal(problem.instance, '/v1/logs/search');
    assert.equal(problem.code, 'ERR_QUERY_OUT_OF_BOUNDS');
  });

  it('should map HTTP 0 to Network Unavailable', () => {
    const httpError = new HttpErrorResponse({
      status: 0,
      statusText: 'Unknown Error',
    });

    const problem = parser.parse(httpError);
    assert.equal(problem.status, 0);
    assert.equal(problem.title, 'Network Unavailable');
    assert.ok(problem.detail.includes('network connectivity'));
  });

  it('should map HTTP 401 to Authentication Required', () => {
    const httpError = new HttpErrorResponse({
      status: 401,
      statusText: 'Unauthorized',
    });

    const problem = parser.parse(httpError);
    assert.equal(problem.status, 401);
    assert.equal(problem.title, 'Authentication Required');
    assert.ok(problem.detail.includes('session has expired'));
  });

  it('should map HTTP 403 to Access Denied', () => {
    const httpError = new HttpErrorResponse({
      status: 403,
      statusText: 'Forbidden',
    });

    const problem = parser.parse(httpError);
    assert.equal(problem.status, 403);
    assert.equal(problem.title, 'Access Denied');
    assert.ok(problem.detail.includes('permissions'));
  });

  it('should map HTTP 429 to Rate Limit Exceeded', () => {
    const httpError = new HttpErrorResponse({
      status: 429,
      statusText: 'Too Many Requests',
    });

    const problem = parser.parse(httpError);
    assert.equal(problem.status, 429);
    assert.equal(problem.title, 'Rate Limit Exceeded');
  });

  it('should map HTTP 504 to Query Timed Out', () => {
    const httpError = new HttpErrorResponse({
      status: 504,
      statusText: 'Gateway Timeout',
    });

    const problem = parser.parse(httpError);
    assert.equal(problem.status, 504);
    assert.equal(problem.title, 'Query Timed Out');
  });

  it('should handle standard JavaScript Error instances gracefully', () => {
    const jsError = new Error('Client-side JSON parsing error');
    const problem = parser.parse(jsError);
    assert.equal(problem.status, 500);
    assert.equal(problem.title, 'Application Error');
    assert.equal(problem.detail, 'Client-side JSON parsing error');
  });
});
