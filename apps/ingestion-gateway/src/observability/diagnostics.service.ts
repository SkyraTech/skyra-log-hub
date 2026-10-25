import { Injectable, Logger } from '@nestjs/common';

export interface DiagnosticsSnapshot {
  requestsTotal: number;
  requestsActive: number;
  authFailures: number;
  authzFailures: number;
  validationFailures: number;
  rateLimitedRequests: number;
  storageUnavailableResponses: number;
  rejectedBatches: number;
  rejectedEvents: number;
  totalEventsProcessed: number;
  uptimeSeconds: number;
}

@Injectable()
export class DiagnosticsService {
  private readonly logger = new Logger(DiagnosticsService.name);
  private readonly startTime = Date.now();

  private requestsTotal = 0;
  private requestsActive = 0;
  private authFailures = 0;
  private authzFailures = 0;
  private validationFailures = 0;
  private rateLimitedRequests = 0;
  private storageUnavailableResponses = 0;
  private rejectedBatches = 0;
  private rejectedEvents = 0;
  private totalEventsProcessed = 0;

  public onRequestStart(): void {
    this.requestsTotal++;
    this.requestsActive++;
  }

  public onRequestEnd(): void {
    if (this.requestsActive > 0) {
      this.requestsActive--;
    }
  }

  public recordAuthFailure(reason: string): void {
    this.authFailures++;
    this.logger.warn(`Operational Diagnostic: Auth failure - ${reason}`);
  }

  public recordAuthzFailure(tenantId: string, projectId: string, reason: string): void {
    this.authzFailures++;
    this.logger.warn(`Operational Diagnostic: Authz failure - tenant=${tenantId} project=${projectId} reason=${reason}`);
  }

  public recordValidationFailure(batchId: string | undefined, eventCount: number, reason: string): void {
    this.validationFailures++;
    this.rejectedBatches++;
    this.rejectedEvents += eventCount;
    this.logger.warn(`Operational Diagnostic: Validation failure - batch=${batchId ?? 'none'} events=${eventCount} reason=${reason}`);
  }

  public recordRateLimitHit(credentialId: string): void {
    this.rateLimitedRequests++;
    this.logger.warn(`Operational Diagnostic: Rate limit exceeded - credential=${credentialId}`);
  }

  public recordStorageUnavailable(batchId: string, eventCount: number): void {
    this.storageUnavailableResponses++;
    this.totalEventsProcessed += eventCount;
    this.logger.debug(`Operational Diagnostic: Storage unavailable returned - batch=${batchId} events=${eventCount}`);
  }

  public getSnapshot(): DiagnosticsSnapshot {
    return {
      requestsTotal: this.requestsTotal,
      requestsActive: this.requestsActive,
      authFailures: this.authFailures,
      authzFailures: this.authzFailures,
      validationFailures: this.validationFailures,
      rateLimitedRequests: this.rateLimitedRequests,
      storageUnavailableResponses: this.storageUnavailableResponses,
      rejectedBatches: this.rejectedBatches,
      rejectedEvents: this.rejectedEvents,
      totalEventsProcessed: this.totalEventsProcessed,
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
    };
  }

  public resetForTesting(): void {
    this.requestsTotal = 0;
    this.requestsActive = 0;
    this.authFailures = 0;
    this.authzFailures = 0;
    this.validationFailures = 0;
    this.rateLimitedRequests = 0;
    this.storageUnavailableResponses = 0;
    this.rejectedBatches = 0;
    this.rejectedEvents = 0;
    this.totalEventsProcessed = 0;
  }
}
