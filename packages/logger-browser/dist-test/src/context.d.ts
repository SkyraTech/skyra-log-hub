/**
 * @skyra/logger-browser - Context Storage and Scope Propagation
 */
export interface BrowserContextData {
    readonly traceId?: string;
    readonly spanId?: string;
    readonly correlationId?: string;
    readonly component?: string;
    readonly labels?: Record<string, string>;
    readonly tags?: readonly string[];
    readonly custom?: Record<string, unknown>;
}
export declare class BrowserContext {
    private _current;
    get(): Readonly<BrowserContextData>;
    set(data: Partial<BrowserContextData>): void;
    clear(): void;
    withContext<T>(scopedData: Partial<BrowserContextData>, fn: () => T): T;
    withContextAsync<T>(scopedData: Partial<BrowserContextData>, fn: () => Promise<T>): Promise<T>;
}
export declare const defaultBrowserContext: BrowserContext;
//# sourceMappingURL=context.d.ts.map