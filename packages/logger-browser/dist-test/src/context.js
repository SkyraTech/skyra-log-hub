/**
 * @skyra/logger-browser - Context Storage and Scope Propagation
 */
import { isValidTraceId, isValidSpanId } from './internal/correlation.js';
export class BrowserContext {
    _current = {};
    get() {
        return this._current;
    }
    set(data) {
        const validated = { ...this._current };
        if (data.traceId !== undefined) {
            if (data.traceId && !isValidTraceId(data.traceId)) {
                throw new Error(`Invalid traceId: "${data.traceId}". Must be 32 non-zero hex digits.`);
            }
            validated['traceId'] = data.traceId ? data.traceId.toLowerCase() : undefined;
        }
        if (data.spanId !== undefined) {
            if (data.spanId && !isValidSpanId(data.spanId)) {
                throw new Error(`Invalid spanId: "${data.spanId}". Must be 16 non-zero hex digits.`);
            }
            validated['spanId'] = data.spanId ? data.spanId.toLowerCase() : undefined;
        }
        if (data.correlationId !== undefined) {
            validated['correlationId'] = data.correlationId
                ? String(data.correlationId).slice(0, 128)
                : undefined;
        }
        if (data.component !== undefined) {
            validated['component'] = data.component
                ? String(data.component).slice(0, 64)
                : undefined;
        }
        if (data.labels !== undefined) {
            validated['labels'] = { ...(this._current.labels ?? {}), ...data.labels };
        }
        if (data.tags !== undefined) {
            const existing = this._current.tags ?? [];
            validated['tags'] = Array.from(new Set([...existing, ...data.tags]));
        }
        if (data.custom !== undefined) {
            validated['custom'] = { ...(this._current.custom ?? {}), ...data.custom };
        }
        this._current = validated;
    }
    clear() {
        this._current = {};
    }
    withContext(scopedData, fn) {
        const previous = this._current;
        try {
            this.set(scopedData);
            return fn();
        }
        finally {
            this._current = previous;
        }
    }
    async withContextAsync(scopedData, fn) {
        const previous = this._current;
        try {
            this.set(scopedData);
            return await fn();
        }
        finally {
            this._current = previous;
        }
    }
}
export const defaultBrowserContext = new BrowserContext();
//# sourceMappingURL=context.js.map