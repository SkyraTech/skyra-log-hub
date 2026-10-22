import type { SkyraLogEvent } from '@skyra/logger-core';
import { validateLogEvent } from '@skyra/logger-core';

export class FormatValidationError extends Error {
  readonly validationErrors: unknown[];

  constructor(message: string, errors: unknown[]) {
    super(message);
    this.name = 'FormatValidationError';
    this.validationErrors = errors;
  }
}

/**
 * Serializes a canonical SkyraLogEvent into a single physical JSONL line ending in '\n'.
 * Guarantees:
 * - Exactly one line per event (newlines inside strings are escaped as '\n' by JSON.stringify)
 * - Strict Unix newline '\n' (0x0A)
 * - No trailing carriage return '\r'
 * - Optional schema validation if strict mode is active
 */
export function formatJsonlEvent(event: SkyraLogEvent, strictValidation = false): string {
  if (strictValidation) {
    const result = validateLogEvent(event);
    if (!result.valid) {
      const summary = result.errors.map((e) => `${e.path}: ${e.message}`).join('; ');
      throw new FormatValidationError(
        `Canonical event failed schema validation: ${summary}`,
        result.errors
      );
    }
  }

  // Fast JSON serialization
  const jsonString = JSON.stringify(event);

  // Guarantee single line termination with \n
  return `${jsonString}\n`;
}
