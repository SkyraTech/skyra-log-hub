/**
 * @skyra/logger-browser - Explicit Fetch Instrumentation Wrapper
 * Measures HTTP requests without reading bodies or credentials.
 */
import type { SkyraBrowserLogger } from '../logger.js';
export declare function instrumentFetch(logger: SkyraBrowserLogger, input: RequestInfo | URL, init?: RequestInit, customFetch?: typeof fetch): Promise<Response>;
//# sourceMappingURL=fetch.d.ts.map