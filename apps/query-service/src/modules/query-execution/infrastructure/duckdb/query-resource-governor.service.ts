import { Injectable, Logger } from '@nestjs/common';
import {
  QueryBudgetExceededException,
  QueryTimeoutException,
  QueryCancelledException,
} from '../../../../common/errors/query.errors.js';

export interface QueuedQueryTask<T> {
  readonly queryId: string;
  readonly tenantId: string;
  readonly execute: () => Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (reason: unknown) => void;
  readonly signal?: AbortSignal;
}

export interface ExecutionHandle {
  abort: () => void;
}

@Injectable()
export class QueryResourceGovernorService {
  private readonly logger = new Logger(QueryResourceGovernorService.name);

  private readonly maxConcurrentQueries = 4;
  private readonly maxQueueDepth = 16;
  private readonly maxConcurrentPerTenant = 2;

  private activeQueries = 0;
  private readonly tenantActiveCount = new Map<string, number>();
  private readonly queue: QueuedQueryTask<unknown>[] = [];

  /**
   * Schedules a query for execution within concurrent slot and queue depth limits.
   */
  public async schedule<T>(
    queryId: string,
    tenantId: string,
    timeoutMs: number,
    executionFn: (onAbort: (handler: () => void) => void) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    if (signal?.aborted) {
      throw new QueryCancelledException(`Query ${queryId} was aborted before execution began.`);
    }

    if (this.queue.length >= this.maxQueueDepth) {
      throw new QueryBudgetExceededException(
        `Analytical query execution queue is at maximum capacity (${this.maxQueueDepth} tasks). Please retry shortly.`,
      );
    }

    return new Promise<T>((resolve, reject) => {
      const task: QueuedQueryTask<T> = {
        queryId,
        tenantId,
        execute: async () => {
          return this.runWithGovernance(queryId, tenantId, timeoutMs, executionFn, signal);
        },
        resolve: resolve as (val: unknown) => void,
        reject,
        signal,
      };

      if (signal) {
        signal.addEventListener(
          'abort',
          () => {
            const idx = this.queue.findIndex((t) => t.queryId === queryId);
            if (idx !== -1) {
              this.queue.splice(idx, 1);
              reject(new QueryCancelledException(`Query ${queryId} was aborted while waiting in queue.`));
            }
          },
          { once: true },
        );
      }

      this.queue.push(task as QueuedQueryTask<unknown>);
      this.processQueue();
    });
  }

  private processQueue(): void {
    if (this.activeQueries >= this.maxConcurrentQueries || this.queue.length === 0) {
      return;
    }

    // Tenant fairness: find the first queued item whose tenant hasn't exceeded maxConcurrentPerTenant
    let selectedIndex = this.queue.findIndex((task) => {
      const currentTenantActive = this.tenantActiveCount.get(task.tenantId) ?? 0;
      return currentTenantActive < this.maxConcurrentPerTenant;
    });

    // If all queued items belong to saturated tenants, fallback to head of queue
    if (selectedIndex === -1) {
      selectedIndex = 0;
    }

    const [task] = this.queue.splice(selectedIndex, 1);
    if (!task) {
      return;
    }

    if (task.signal?.aborted) {
      task.reject(new QueryCancelledException(`Query ${task.queryId} was aborted prior to slot dispatch.`));
      this.processQueue();
      return;
    }

    this.activeQueries++;
    const currentTenantActive = this.tenantActiveCount.get(task.tenantId) ?? 0;
    this.tenantActiveCount.set(task.tenantId, currentTenantActive + 1);

    task
      .execute()
      .then(task.resolve)
      .catch(task.reject)
      .finally(() => {
        this.activeQueries--;
        const updated = (this.tenantActiveCount.get(task.tenantId) ?? 1) - 1;
        if (updated <= 0) {
          this.tenantActiveCount.delete(task.tenantId);
        } else {
          this.tenantActiveCount.set(task.tenantId, updated);
        }
        this.processQueue();
      });
  }

  private async runWithGovernance<T>(
    queryId: string,
    _tenantId: string,
    timeoutMs: number,
    executionFn: (onAbort: (handler: () => void) => void) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    let abortHandler: (() => void) | undefined;
    let timer: NodeJS.Timeout | undefined;
    let timedOut = false;

    const onAbort = (handler: () => void): void => {
      abortHandler = handler;
    };

    const cleanup = (): void => {
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
    };

    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        this.logger.warn(`Query ${queryId} exceeded timeout budget of ${timeoutMs}ms. Triggering execution interrupt.`);
        if (abortHandler) {
          try {
            abortHandler();
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            this.logger.warn(`Error invoking abort handler on timeout: ${msg}`);
          }
        }
        reject(new QueryTimeoutException(`Query exceeded maximum execution timeout ceiling of ${timeoutMs}ms.`));
      }, timeoutMs);
    });

    const abortPromise = new Promise<never>((_, reject) => {
      if (signal) {
        if (signal.aborted) {
          if (abortHandler) abortHandler();
          reject(new QueryCancelledException(`Query ${queryId} was aborted.`));
        }
        signal.addEventListener(
          'abort',
          () => {
            this.logger.log(`Query ${queryId} received abort signal. Triggering execution interrupt.`);
            if (abortHandler) {
              try {
                abortHandler();
              } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e);
                this.logger.warn(`Error invoking abort handler on signal: ${msg}`);
              }
            }
            reject(new QueryCancelledException(`Query ${queryId} was aborted by client.`));
          },
          { once: true },
        );
      }
    });

    try {
      const result = await Promise.race([
        executionFn(onAbort),
        timeoutPromise,
        abortPromise,
      ]);
      return result;
    } catch (err: unknown) {
      if (timedOut) {
        throw new QueryTimeoutException(`Query exceeded maximum execution timeout ceiling of ${timeoutMs}ms.`);
      }
      throw err;
    } finally {
      cleanup();
    }
  }

  public getActiveCount(): number {
    return this.activeQueries;
  }

  public getQueueLength(): number {
    return this.queue.length;
  }
}
