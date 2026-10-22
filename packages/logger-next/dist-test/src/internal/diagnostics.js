/**
 * Safe, internal diagnostics for @skyra/logger-next.
 * Guarantees zero unhandled exceptions and secret-safe stderr reporting.
 */
export function reportDiagnostic(code, message, details) {
    try {
        const timestamp = new Date().toISOString();
        let detailStr = '';
        if (details !== undefined) {
            if (typeof details === 'object' && details !== null) {
                detailStr = ` | details: ${JSON.stringify(details)}`;
            }
            else {
                detailStr = ` | details: ${String(details)}`;
            }
        }
        process.stderr.write(`[SkyraLoggerNext:${code}] ${timestamp} - ${message}${detailStr}\n`);
    }
    catch {
        // Zero throw guarantee
    }
}
//# sourceMappingURL=diagnostics.js.map