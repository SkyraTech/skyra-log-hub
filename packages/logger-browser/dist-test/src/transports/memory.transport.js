/**
 * @skyra/logger-browser - Memory Transport
 * Retains events in an in-memory bounded ring buffer. Ideal for tests and offline diagnostics.
 */
export class MemoryTransport {
    name = 'memory';
    _events = [];
    _maxEvents;
    constructor(options) {
        this._maxEvents = Math.max(1, options?.maxEvents ?? 1000);
    }
    async send(batch) {
        for (const ev of batch) {
            if (this._events.length >= this._maxEvents) {
                this._events.shift(); // Drop oldest FIFO
            }
            this._events.push(ev);
        }
        return {
            success: true,
            deliveredCount: batch.length,
            droppedCount: 0,
            retryable: false,
        };
    }
    getEvents() {
        return [...this._events];
    }
    getEventCount() {
        return this._events.length;
    }
    clear() {
        this._events.length = 0;
    }
    async flush() {
        // In-memory writes are immediate
    }
    async dispose() {
        this.clear();
    }
}
//# sourceMappingURL=memory.transport.js.map