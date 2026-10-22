/**
 * @skyra/logger-browser - Console Transport
 * Provides rich development and browser debugging logs without leaking secrets.
 */
import type { SkyraLogEvent, LogLevel } from '@skyra/logger-core/types';
import type { BrowserTransport, BrowserTransportResult } from './transport.interface.js';
export interface ConsoleTransportOptions {
    readonly levels?: readonly LogLevel[];
    readonly useColors?: boolean;
}
export declare class ConsoleTransport implements BrowserTransport {
    readonly name = "console";
    private readonly _allowedLevels;
    private readonly _useColors;
    constructor(options?: ConsoleTransportOptions);
    send(batch: readonly SkyraLogEvent[]): Promise<BrowserTransportResult>;
    flush(): Promise<void>;
    dispose(): Promise<void>;
}
//# sourceMappingURL=console.transport.d.ts.map