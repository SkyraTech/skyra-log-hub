/**
 * @skyra/logger-browser - Bounded Batch Queue with Priority Eviction and Retry Engine
 */
import { HttpTransport } from '../transports/http.transport.js';
import { emitBrowserDiagnostic } from './diagnostics.js';
export class BatchQueue {
    _config;
    _transport;
    _queue = [];
    _totalBytes = 0;
    _timerId = null;
    _isFlushing = false;
    _isDisposed = false;
    // Diagnostic counters
    _acceptedCount = 0;
    _deliveredCount = 0;
    _droppedCount = 0;
    _evictedCount = 0;
    _failedCount = 0;
    // Batching & Retry limits
    _maxBatchSize;
    _maxBatchBytes;
    _flushIntervalMs;
    _maxRetries;
    _initialDelayMs;
    _maxDelayMs;
    _backoffMultiplier;
    constructor(config, transport) {
        this._config = config;
        this._transport = transport;
        // Resolve transport batching parameters
        const httpConf = typeof config.transport === 'object' && 'type' in config.transport && config.transport.type === 'http'
            ? config.transport
            : undefined;
        this._maxBatchSize = httpConf?.maxBatchSize ?? 100;
        this._maxBatchBytes = httpConf?.maxBatchBytes ?? 256 * 1024;
        this._flushIntervalMs = httpConf?.flushIntervalMs ?? 5000;
        this._maxRetries = httpConf?.retry?.maxRetries ?? 3;
        this._initialDelayMs = httpConf?.retry?.initialDelayMs ?? 500;
        this._maxDelayMs = httpConf?.retry?.maxDelayMs ?? 10000;
        this._backoffMultiplier = httpConf?.retry?.backoffMultiplier ?? 2.0;
        // Start background flush timer if interval > 0
        if (this._flushIntervalMs > 0 && typeof setInterval !== 'undefined') {
            this._timerId = setInterval(() => {
                void this.flush();
            }, this._flushIntervalMs);
            // Unref in Node environment if present
            if (this._timerId && typeof this._timerId.unref === 'function') {
                this._timerId.unref();
            }
        }
    }
    enqueue(event) {
        if (this._isDisposed) {
            this._droppedCount++;
            emitBrowserDiagnostic('EnqueueAfterDispose', `Event ${event.event.id} dropped: logger is disposed.`);
            return false;
        }
        // Estimate serialized byte size
        const byteSize = JSON.stringify(event).length;
        if (byteSize > this._config.limits.maxEventSizeBytes) {
            this._droppedCount++;
            emitBrowserDiagnostic('EventTooLarge', `Event ${event.event.id} dropped: ${byteSize} bytes exceeds maxEventSizeBytes (${this._config.limits.maxEventSizeBytes}).`);
            return false;
        }
        const level = event.log.level;
        const isCritical = level === 'error' || level === 'fatal';
        // Check capacity: count and bytes
        while ((this._queue.length >= this._config.limits.maxQueueEvents ||
            this._totalBytes + byteSize > this._config.limits.maxQueueBytes) &&
            this._queue.length > 0) {
            if (isCritical) {
                // Priority Eviction: Evict oldest non-critical event
                const nonCriticalIdx = this._queue.findIndex((item) => item.event.log.level !== 'error' && item.event.log.level !== 'fatal');
                if (nonCriticalIdx >= 0) {
                    const evicted = this._queue.splice(nonCriticalIdx, 1)[0];
                    this._totalBytes -= evicted.byteSize;
                    this._evictedCount++;
                    this._droppedCount++;
                    continue;
                }
            }
            // If queue is full of critical events, or incoming event is not critical: drop!
            this._droppedCount++;
            emitBrowserDiagnostic('QueueSaturated', `Queue saturated (${this._queue.length} items, ${this._totalBytes} bytes). Dropping ${level} event.`);
            return false;
        }
        this._queue.push({ event, byteSize, retries: 0 });
        this._totalBytes += byteSize;
        this._acceptedCount++;
        // Check immediate flush trigger
        if (this._config.immediateFlushLevels.has(level)) {
            void this.flush();
        }
        else if (this._queue.length >= this._maxBatchSize ||
            this._totalBytes >= this._maxBatchBytes) {
            void this.flush();
        }
        return true;
    }
    async flush() {
        if (this._isFlushing || this._queue.length === 0) {
            return;
        }
        this._isFlushing = true;
        try {
            while (this._queue.length > 0) {
                // Take a batch
                const batchItems = [];
                let batchBytes = 0;
                while (this._queue.length > 0) {
                    const next = this._queue[0];
                    if (batchItems.length > 0 &&
                        (batchItems.length >= this._maxBatchSize ||
                            batchBytes + next.byteSize > this._maxBatchBytes)) {
                        break;
                    }
                    const item = this._queue.shift();
                    this._totalBytes -= item.byteSize;
                    batchItems.push(item);
                    batchBytes += item.byteSize;
                }
                if (batchItems.length === 0)
                    break;
                const events = batchItems.map((i) => i.event);
                let result;
                try {
                    result = await this._transport.send(events);
                }
                catch (sendErr) {
                    result = {
                        success: false,
                        deliveredCount: 0,
                        droppedCount: 0,
                        retryable: true,
                        error: sendErr instanceof Error ? sendErr.message : String(sendErr),
                    };
                }
                if (result.success) {
                    this._deliveredCount += result.deliveredCount;
                }
                else if (result.retryable) {
                    // Re-queue eligible items
                    for (const item of batchItems) {
                        item.retries++;
                        if (item.retries <= this._maxRetries) {
                            this._queue.unshift(item); // Push back to front
                            this._totalBytes += item.byteSize;
                        }
                        else {
                            this._failedCount++;
                            this._droppedCount++;
                            emitBrowserDiagnostic('RetriesExhausted', `Event ${item.event.event.id} dropped: retry limit (${this._maxRetries}) exhausted.`);
                        }
                    }
                    // Break flush loop on retryable failure to allow delay before next attempt
                    break;
                }
                else {
                    // Permanent failure
                    this._failedCount += batchItems.length;
                    this._droppedCount += batchItems.length;
                }
            }
            if (this._transport.flush) {
                await this._transport.flush();
            }
        }
        finally {
            this._isFlushing = false;
        }
    }
    /**
     * Flush on page lifecycle exit (visibilitychange, pagehide) using sendBeacon if available.
     */
    flushLifecycle() {
        if (this._queue.length === 0)
            return;
        if (this._transport instanceof HttpTransport) {
            const items = this._queue.splice(0, this._queue.length);
            this._totalBytes = 0;
            const events = items.map((i) => i.event);
            const sent = this._transport.sendBeaconBatch(events);
            if (sent) {
                this._deliveredCount += events.length;
            }
            else {
                this._droppedCount += events.length;
            }
        }
        else {
            void this.flush();
        }
    }
    async dispose() {
        if (this._isDisposed)
            return;
        this._isDisposed = true;
        if (this._timerId !== null) {
            clearInterval(this._timerId);
            this._timerId = null;
        }
        // Flush any pending events before teardown
        await this.flush();
        if (this._transport.dispose) {
            await this._transport.dispose();
        }
    }
    getStatus() {
        return {
            acceptedCount: this._acceptedCount,
            deliveredCount: this._deliveredCount,
            droppedCount: this._droppedCount,
            evictedCount: this._evictedCount,
            failedCount: this._failedCount,
            queueDepth: this._queue.length,
            queueBytes: this._totalBytes,
            isDisposed: this._isDisposed,
        };
    }
}
//# sourceMappingURL=batch-queue.js.map