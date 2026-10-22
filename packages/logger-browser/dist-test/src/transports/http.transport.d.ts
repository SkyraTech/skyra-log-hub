/**
 * @skyra/logger-browser - HTTP Transport
 * Delivers batched log events to an application-provided ingestion endpoint via fetch() or sendBeacon().
 */
import type { SkyraLogEvent } from '@skyra/logger-core/types';
import type { HttpTransportConfig } from '../types.js';
import type { BrowserTransport, BrowserTransportResult } from './transport.interface.js';
export declare class HttpTransport implements BrowserTransport {
    readonly name = "http";
    private readonly _url;
    private readonly _headers;
    private readonly _credentials;
    private readonly _allowedOrigins?;
    private readonly _useBeaconOnUnload;
    constructor(options: HttpTransportConfig);
    send(batch: readonly SkyraLogEvent[]): Promise<BrowserTransportResult>;
    /**
     * Delivers batch using navigator.sendBeacon during page unload / lifecycle transitions.
     */
    sendBeaconBatch(batch: readonly SkyraLogEvent[]): boolean;
    flush(): Promise<void>;
    dispose(): Promise<void>;
}
//# sourceMappingURL=http.transport.d.ts.map