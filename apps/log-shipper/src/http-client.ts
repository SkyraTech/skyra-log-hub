/**
 * @skyra/log-shipper - HTTP Ingestion Client & Receipt Validator
 */

import type { PendingBatch, DeliveryResult, GatewayBatchResponse, GatewayReceipt } from './types.js';

export interface ShipperHttpClientOptions {
  gatewayUrl: string;
  authToken: string;
  requestTimeoutMs?: number;
}

export class ShipperHttpClient {
  private readonly gatewayUrl: string;
  private readonly authToken: string;
  private readonly requestTimeoutMs: number;

  constructor(options: ShipperHttpClientOptions) {
    if (!options.gatewayUrl || !options.gatewayUrl.trim()) {
      throw new Error('ShipperHttpClient requires a non-empty gatewayUrl.');
    }
    if (!options.authToken || !options.authToken.trim()) {
      throw new Error('ShipperHttpClient requires a non-empty authToken.');
    }

    this.gatewayUrl = options.gatewayUrl.trim();
    this.authToken = options.authToken.trim();
    this.requestTimeoutMs = options.requestTimeoutMs ?? 10000;
  }

  /**
   * Submits a pending batch to the central ingestion gateway and verifies the durable receipt.
   */
  public async submitBatch(batch: PendingBatch): Promise<DeliveryResult> {
    const payload = JSON.stringify({
      protocol_version: '1.0',
      batch_id: batch.batchId,
      sent_at: new Date().toISOString(),
      batch_size: batch.eventCount,
      events: batch.events,
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    try {
      const response = await fetch(this.gatewayUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.authToken}`,
        },
        body: payload,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const rawText = await response.text();
      let parsed: any;
      try {
        parsed = JSON.parse(rawText);
      } catch {
        parsed = null;
      }

      if (response.ok && parsed && parsed.status === 'durably_accepted') {
        const receiptValidation = this.validateReceipt(batch, parsed);
        if (!receiptValidation.valid) {
          return {
            success: false,
            statusCode: response.status,
            retryable: true,
            error: `Gateway returned invalid receipt: ${receiptValidation.reason}`,
          };
        }

        return {
          success: true,
          duplicate: Boolean(parsed.duplicate),
          receipt: parsed.receipt as GatewayReceipt,
          statusCode: response.status,
          retryable: false,
        };
      }

      // Handle non-200 responses
      const isRetryable = response.status === 429 || response.status >= 500;
      const errorMsg = parsed?.error?.message ?? `HTTP ${response.status}: ${rawText.slice(0, 200)}`;

      return {
        success: false,
        statusCode: response.status,
        retryable: isRetryable,
        error: this.redactSecrets(errorMsg),
      };
    } catch (err: any) {
      clearTimeout(timeoutId);

      const isTimeout = err?.name === 'AbortError';
      const msg = isTimeout ? 'Request timed out' : String(err?.message ?? err);

      return {
        success: false,
        retryable: true,
        error: this.redactSecrets(msg),
      };
    }
  }

  /**
   * Strictly validates that the durable receipt matches the batch that was submitted.
   */
  private validateReceipt(
    batch: PendingBatch,
    response: GatewayBatchResponse
  ): { valid: boolean; reason?: string } {
    if (response.batch_id !== batch.batchId) {
      return {
        valid: false,
        reason: `Receipt batch_id mismatch (expected ${batch.batchId}, got ${response.batch_id})`,
      };
    }

    if (response.accepted_count !== batch.eventCount) {
      return {
        valid: false,
        reason: `Receipt accepted_count mismatch (expected ${batch.eventCount}, got ${response.accepted_count})`,
      };
    }

    const rcpt = response.receipt;
    if (!rcpt || !rcpt.receipt_id || typeof rcpt.receipt_id !== 'string') {
      return { valid: false, reason: 'Missing receipt_id in receipt object' };
    }

    if (!rcpt.journal_segment || typeof rcpt.journal_segment !== 'string') {
      return { valid: false, reason: 'Missing journal_segment in receipt object' };
    }

    const expectedDigestPrefix = `sha256:${batch.contentDigestSha256}`;
    if (
      rcpt.content_digest !== expectedDigestPrefix &&
      rcpt.content_digest !== batch.contentDigestSha256
    ) {
      return {
        valid: false,
        reason: `Receipt content_digest mismatch (expected ${expectedDigestPrefix}, got ${rcpt.content_digest})`,
      };
    }

    return { valid: true };
  }

  private redactSecrets(str: string): string {
    return str.replace(new RegExp(this.authToken, 'g'), '[REDACTED_TOKEN]');
  }
}
