/**
 * @skyra/logger-browser - Memory Transport
 * Retains events in an in-memory bounded ring buffer. Ideal for tests and offline diagnostics.
 */
import type { SkyraLogEvent } from '@skyra/logger-core/types';
import type { BrowserTransport, BrowserTransportResult } from './transport.interface.js';
export declare class MemoryTransport implements BrowserTransport {
    readonly name = "memory";
    private readonly _events;
    private readonly _maxEvents;
    constructor(options?: {
        maxEvents?: number;
    });
    send(batch: readonly SkyraLogEvent[]): Promise<BrowserTransportResult>;
    getEvents(): readonly SkyraLogEvent[];
    getEventCount(): number;
    clear(): void;
    flush(): Promise<void>;
    dispose(): Promise<void>;
}
//# sourceMappingURL=memory.transport.d.ts.map