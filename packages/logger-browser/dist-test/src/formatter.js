/**
 * @skyra/logger-browser - JSON Formatter
 */
export function formatBrowserEvent(event) {
    return JSON.stringify(event);
}
export function formatBrowserBatch(batch) {
    return JSON.stringify({
        events: batch,
        sent_at: new Date().toISOString(),
        batch_size: batch.length,
    });
}
//# sourceMappingURL=formatter.js.map