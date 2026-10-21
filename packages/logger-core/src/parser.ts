/**
 * Strict JSON parser that rejects duplicate property keys at any object depth.
 * Standard JSON.parse silently overwrites earlier keys. This implementation
 * validates lexical key uniqueness before returning the parsed JSON structure.
 */

export class DuplicateKeyError extends Error {
  readonly key: string;
  readonly position: number;

  constructor(key: string, position: number) {
    super(`Strict JSON Parse Error: Duplicate property '${key}' at character offset ${position}`);
    this.name = 'DuplicateKeyError';
    this.key = key;
    this.position = position;
  }
}

/**
 * Checks for duplicate keys in a JSON string.
 * Uses a token scanner that inspects object key declarations.
 */
function assertNoDuplicateKeys(jsonText: string): void {
  const len = jsonText.length;
  let i = 0;

  // Stack of sets of seen keys for nested objects
  const stack: Array<{ seen: Set<string>; expectingKey: boolean }> = [];
  let inString = false;
  let stringStart = 0;
  let isEscaped = false;

  while (i < len) {
    const char = jsonText[i];

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
      } else if (char === '\\') {
        isEscaped = true;
      } else if (char === '"') {
        inString = false;
        // If we were expecting an object key, extract it
        const currentFrame = stack[stack.length - 1];
        if (currentFrame && currentFrame.expectingKey) {
          // Parse the string token safely
          let key: string;
          try {
            key = JSON.parse(jsonText.substring(stringStart, i + 1)) as string;
          } catch {
            key = jsonText.substring(stringStart + 1, i);
          }

          if (currentFrame.seen.has(key)) {
            throw new DuplicateKeyError(key, stringStart);
          }
          currentFrame.seen.add(key);
          currentFrame.expectingKey = false;
        }
      }
      i++;
      continue;
    }

    if (char === '"') {
      inString = true;
      stringStart = i;
      isEscaped = false;
      i++;
      continue;
    }

    // Skip whitespace
    if (char === ' ' || char === '\t' || char === '\n' || char === '\r') {
      i++;
      continue;
    }

    if (char === '{') {
      stack.push({ seen: new Set<string>(), expectingKey: true });
      i++;
      continue;
    }

    if (char === '}') {
      if (stack.length > 0) {
        stack.pop();
      }
      i++;
      continue;
    }

    if (char === '[') {
      // Enter array context: inside arrays, strings are values, not object keys
      stack.push({ seen: new Set<string>(), expectingKey: false });
      i++;
      continue;
    }

    if (char === ']') {
      if (stack.length > 0) {
        stack.pop();
      }
      i++;
      continue;
    }

    if (char === ':') {
      // After colon, we are expecting value, not key
      i++;
      continue;
    }

    if (char === ',') {
      const currentFrame = stack[stack.length - 1];
      if (currentFrame && currentFrame.seen.size > 0) {
        // If in an object (has seen keys tracking), the next string token is a key
        currentFrame.expectingKey = true;
      }
      i++;
      continue;
    }

    i++;
  }
}

/**
 * Strict JSON parser. Guarantees that no object contains duplicate keys.
 */
export function parseStrictJson<T = unknown>(jsonText: string): T {
  const trimmed = jsonText.trim();
  if (!trimmed) {
    throw new Error('Unexpected empty JSON string');
  }

  // First lexical pass: verify key uniqueness
  assertNoDuplicateKeys(trimmed);

  // Second pass: standard parse
  return JSON.parse(trimmed) as T;
}

/**
 * Parses a multiline JSONL string line by line using the strict duplicate-key parser.
 */
export function parseJsonl<T = unknown>(jsonlContent: string): { records: T[]; errors: Array<{ line: number; error: string }> } {
  const lines = jsonlContent.split(/\r?\n/);
  const records: T[] = [];
  const errors: Array<{ line: number; error: string }> = [];

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    if (!line) continue;
    const rawLine = line.trim();
    if (!rawLine) continue; // Skip empty lines

    try {
      const parsed = parseStrictJson<T>(rawLine);
      records.push(parsed);
    } catch (err: unknown) {
      errors.push({
        line: idx + 1,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { records, errors };
}
