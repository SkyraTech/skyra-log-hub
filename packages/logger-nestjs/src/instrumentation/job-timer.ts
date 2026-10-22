import type { SkyraLogger } from '@skyra/logger-node';

export interface JobTimerOptions {
  /** Optional unique job instance identifier */
  id?: string;
  /** Queue name or category (e.g. 'invoices', 'notifications') */
  queue?: string;
  /** Current execution attempt number (1-indexed) */
  attempt?: number;
  /** Maximum retry attempts configured for this job */
  maxAttempts?: number;
  /** Optional job type or classification */
  type?: string;
  /** Duration in milliseconds the job spent waiting in the queue before execution */
  queueDurationMs?: number;
  /** Additional safe metadata (no secrets) */
  metadata?: Record<string, unknown>;
}

/**
 * Reusable helper measuring the monotonic execution duration of asynchronous background jobs.
 *
 * @param logger The underlying SkyraLogger instance
 * @param name The job name or identifier (e.g. 'generate-monthly-invoices')
 * @param fn The asynchronous job worker function to execute and measure
 * @param options Additional job metadata
 * @returns The return value of `fn`
 */
export async function measureJob<T>(
  logger: SkyraLogger,
  name: string,
  fn: () => Promise<T>,
  options: JobTimerOptions = {}
): Promise<T> {
  const startNs = process.hrtime.bigint();
  const jobName = name.slice(0, 128);

  const jobSection: Record<string, unknown> = {
    name: jobName,
  };
  if (options.id) jobSection['id'] = String(options.id).slice(0, 128);
  if (options.queue) jobSection['queue'] = String(options.queue).slice(0, 128);
  if (options.attempt !== undefined && options.attempt >= 1) {
    jobSection['attempt'] = Math.floor(options.attempt);
  }
  if (options.maxAttempts !== undefined && options.maxAttempts >= 1) {
    jobSection['max_attempts'] = Math.floor(options.maxAttempts);
  }

  const skyraJobSection: Record<string, unknown> = {
    status: 'running',
  };
  if (options.id) skyraJobSection['id'] = String(options.id).slice(0, 128);
  if (options.type) skyraJobSection['type'] = String(options.type).slice(0, 64);
  if (options.queueDurationMs !== undefined && options.queueDurationMs >= 0) {
    skyraJobSection['queue_duration_ms'] = options.queueDurationMs;
  }
  if (options.attempt !== undefined && options.attempt >= 1) {
    skyraJobSection['attempt'] = Math.floor(options.attempt);
  }

  try {
    const result = await fn();
    const elapsedNs = Number(process.hrtime.bigint() - startNs);
    const elapsedMs = Number((elapsedNs / 1_000_000).toFixed(3));

    skyraJobSection['status'] = 'completed';

    logger.info(`Job completed: ${jobName}`, {
      action: 'job.completed',
      outcome: 'success',
      category: ['process'],
      durationMs: elapsedMs,
      durationNs: elapsedNs,
      job: jobSection,
      skyra: {
        job: skyraJobSection,
      },
      ...(options.metadata ? options.metadata : {}),
    });

    return result;
  } catch (error) {
    const elapsedNs = Number(process.hrtime.bigint() - startNs);
    const elapsedMs = Number((elapsedNs / 1_000_000).toFixed(3));

    skyraJobSection['status'] = 'failed';

    logger.error(`Job failed: ${jobName}`, {
      action: 'job.failed',
      outcome: 'failure',
      category: ['process'],
      durationMs: elapsedMs,
      durationNs: elapsedNs,
      job: jobSection,
      skyra: {
        job: skyraJobSection,
      },
      error,
      ...(options.metadata ? options.metadata : {}),
    });

    throw error;
  }
}
