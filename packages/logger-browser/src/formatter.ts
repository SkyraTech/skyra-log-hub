/**
 * @skyra/logger-browser - JSON Formatter
 */

import type { SkyraLogEvent } from '@skyra/logger-core/types';

export function formatBrowserEvent(event: SkyraLogEvent): string {
  return JSON.stringify(event);
}

export function formatBrowserBatch(batch: readonly SkyraLogEvent[]): string {
  return JSON.stringify({
    events: batch,
    sent_at: new Date().toISOString(),
    batch_size: batch.length,
  });
}
