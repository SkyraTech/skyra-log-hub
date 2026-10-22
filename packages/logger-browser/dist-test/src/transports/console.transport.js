/**
 * @skyra/logger-browser - Console Transport
 * Provides rich development and browser debugging logs without leaking secrets.
 */
const LEVEL_COLORS = {
    trace: 'color: #888888; font-weight: normal;',
    debug: 'color: #00bcd4; font-weight: normal;',
    info: 'color: #2196f3; font-weight: bold;',
    warn: 'color: #ff9800; font-weight: bold;',
    error: 'color: #f44336; font-weight: bold;',
    fatal: 'color: #d32f2f; font-weight: bold; background: #ffebee;',
};
export class ConsoleTransport {
    name = 'console';
    _allowedLevels;
    _useColors;
    constructor(options) {
        const defaultLevels = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];
        this._allowedLevels = new Set(options?.levels ?? defaultLevels);
        this._useColors = options?.useColors !== false && typeof window !== 'undefined';
    }
    async send(batch) {
        if (typeof console === 'undefined') {
            return {
                success: true,
                deliveredCount: batch.length,
                droppedCount: 0,
                retryable: false,
            };
        }
        let delivered = 0;
        for (const ev of batch) {
            const level = ev.log.level;
            if (!this._allowedLevels.has(level)) {
                continue;
            }
            const component = ev.skyra.component ? ` [${ev.skyra.component}]` : '';
            const prefix = `[${ev['@timestamp']}] [${level.toUpperCase()}]${component}:`;
            const args = [];
            if (this._useColors) {
                const style = LEVEL_COLORS[level] ?? 'color: inherit;';
                args.push(`%c${prefix}`, style, ev.message);
            }
            else {
                args.push(prefix, ev.message);
            }
            if (ev.skyra.business && Object.keys(ev.skyra.business).length > 0) {
                args.push(ev.skyra.business);
            }
            if (ev.error) {
                args.push(ev.error);
            }
            switch (level) {
                case 'trace':
                case 'debug':
                    (console.debug || console.log).apply(console, args);
                    break;
                case 'info':
                    (console.info || console.log).apply(console, args);
                    break;
                case 'warn':
                    (console.warn || console.log).apply(console, args);
                    break;
                case 'error':
                case 'fatal':
                    (console.error || console.log).apply(console, args);
                    break;
                default:
                    console.log.apply(console, args);
                    break;
            }
            delivered++;
        }
        return {
            success: true,
            deliveredCount: delivered,
            droppedCount: batch.length - delivered,
            retryable: false,
        };
    }
    async flush() {
        // Console output is synchronous
    }
    async dispose() {
        // No-op
    }
}
//# sourceMappingURL=console.transport.js.map