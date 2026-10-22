/**
 * @skyra/logger-browser - Page Lifecycle Management
 * Handles visibilitychange and pagehide events to flush pending batches via sendBeacon().
 */
import type { BatchQueue } from './batch-queue.js';
export declare function installLifecycleHandlers(queue: BatchQueue): () => void;
//# sourceMappingURL=lifecycle.d.ts.map