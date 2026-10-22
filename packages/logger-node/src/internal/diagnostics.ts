import { redactSensitiveData } from '@skyra/logger-core';

let lastDiagnosticTimestamp = 0;
const DIAGNOSTIC_THROTTLE_MS = 500;

export function resetDiagnosticThrottleForTesting(): void {
  lastDiagnosticTimestamp = 0;
}

/**
 * Emits an internal diagnostic warning or error to stderr.
 * Guarantees:
 * - Rate-limited to prevent terminal flooding
 * - Automatically redacts any sensitive substrings / stack trace tokens
 * - Never calls the main logger recursively
 */
export function emitInternalDiagnostic(category: string, message: string, details?: unknown): void {
  const now = Date.now();
  if (now - lastDiagnosticTimestamp < DIAGNOSTIC_THROTTLE_MS) {
    return; // Throttled
  }
  lastDiagnosticTimestamp = now;

  let safeDetails = '';
  if (details !== undefined) {
    try {
      const redacted = redactSensitiveData(details);
      safeDetails = ` | details: ${JSON.stringify(redacted)}`;
    } catch {
      safeDetails = ' | details: [unserializable]';
    }
  }

  const safeMessage = redactSensitiveData(message);
  const line = `[SkyraLogger:${category}] ${new Date().toISOString()} - ${safeMessage}${safeDetails}\n`;

  try {
    process.stderr.write(line);
  } catch {
    // If even stderr fails, ignore to prevent crashing the host application
  }
}
