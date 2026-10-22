import type { SkyraLogger, LogContext } from '@skyra/logger-node';

/**
 * Reusable helper measuring the monotonic execution duration of any generic asynchronous business operation.
 *
 * @param logger The underlying SkyraLogger instance
 * @param name The operation name (e.g. 'process-payment', 'generate-pdf')
 * @param fn The asynchronous function to execute and measure
 * @param metadata Optional contextual metadata
 * @returns The return value of `fn`
 */
export async function measureOperation<T>(
  logger: SkyraLogger,
  name: string,
  fn: () => Promise<T>,
  metadata: LogContext = {}
): Promise<T> {
  const startNs = process.hrtime.bigint();
  const opName = name.slice(0, 128);

  try {
    const result = await fn();
    const elapsedNs = Number(process.hrtime.bigint() - startNs);
    const elapsedMs = Number((elapsedNs / 1_000_000).toFixed(3));

    logger.info(`Operation completed: ${opName}`, {
      action: `${opName}.completed`,
      outcome: 'success',
      durationMs: elapsedMs,
      durationNs: elapsedNs,
      ...metadata,
    });

    return result;
  } catch (error) {
    const elapsedNs = Number(process.hrtime.bigint() - startNs);
    const elapsedMs = Number((elapsedNs / 1_000_000).toFixed(3));

    logger.error(`Operation failed: ${opName}`, {
      action: `${opName}.failed`,
      outcome: 'failure',
      durationMs: elapsedMs,
      durationNs: elapsedNs,
      error,
      ...metadata,
    });

    throw error;
  }
}
