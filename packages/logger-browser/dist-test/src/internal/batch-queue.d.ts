/**
 * @skyra/logger-browser - Bounded Batch Queue with Priority Eviction and Retry Engine
 */
import type { SkyraLogEvent } from '@skyra/logger-core/types';
import type { ResolvedBrowserConfig } from '../config.js';
import type { BrowserTransport } from '../transports/transport.interface.js';
export declare class BatchQueue {
    private readonly _config;
    private readonly _transport;
    private readonly _queue;
    private _totalBytes;
    private _timerId;
    private _isFlushing;
    private _isDisposed;
    private _acceptedCount;
    private _deliveredCount;
    private _droppedCount;
    private _evictedCount;
    private _failedCount;
    private readonly _maxBatchSize;
    private readonly _maxBatchBytes;
    private readonly _flushIntervalMs;
    private readonly _maxRetries;
    private readonly _initialDelayMs;
    private readonly _maxDelayMs;
    private readonly _backoffMultiplier;
    constructor(config: ResolvedBrowserConfig, transport: BrowserTransport);
    enqueue(event: SkyraLogEvent): boolean;
    flush(): Promise<void>;
    /**
     * Flush on page lifecycle exit (visibilitychange, pagehide) using sendBeacon if available.
     */
    flushLifecycle(): void;
    dispose(): Promise<void>;
    getStatus(): {
        acceptedCount: number;
        deliveredCount: number;
        droppedCount: number;
        evictedCount: number;
        failedCount: number;
        queueDepth: number;
        queueBytes: number;
        isDisposed: boolean;
    };
}
//# sourceMappingURL=batch-queue.d.ts.map