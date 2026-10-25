/**
 * @skyra/log-shipper - Operational Diagnostics and Metrics
 */

import type { ShipperMetrics } from './types.js';

export class ShipperDiagnostics {
  private readonly metrics: ShipperMetrics = {
    filesDiscovered: 0,
    filesProcessed: 0,
    linesRead: 0,
    batchesSent: 0,
    eventsDelivered: 0,
    duplicateAcknowledgements: 0,
    retriesAttempted: 0,
    corruptLinesQuarantined: 0,
    permanentErrors: 0,
  };

  public increment(counter: keyof ShipperMetrics, amount = 1): void {
    this.metrics[counter] += amount;
  }

  public getMetrics(): Readonly<ShipperMetrics> {
    return { ...this.metrics };
  }

  public logInfo(message: string, details?: Record<string, unknown>): void {
    const formatted = details ? `${message} | ${JSON.stringify(details)}` : message;
    console.log(`[SkyraLogShipper:INFO] ${new Date().toISOString()} - ${formatted}`);
  }

  public logWarn(message: string, details?: Record<string, unknown>): void {
    const formatted = details ? `${message} | ${JSON.stringify(details)}` : message;
    console.warn(`[SkyraLogShipper:WARN] ${new Date().toISOString()} - ${formatted}`);
  }

  public logError(message: string, error?: unknown): void {
    const errStr = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(`[SkyraLogShipper:ERROR] ${new Date().toISOString()} - ${message} | ${errStr}`);
  }
}
