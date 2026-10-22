import type { ResourceLimits } from '../config.js';

/**
 * Sanitizes and bounds arbitrary user metadata objects against:
 * - Circular references
 * - Excessive nesting depth (> maxMetadataDepth)
 * - Oversized string lengths (> maxMessageLength)
 * - Unbounded object keys (> maxObjectEntries)
 * - Runaway array lengths (> maxArrayLength)
 * - Non-serializable types (Function, Symbol, BigInt)
 */
export function sanitizeMetadata(
  target: unknown,
  limits: ResourceLimits,
  currentDepth = 0,
  visited = new WeakSet<object>()
): unknown {
  if (target === null || target === undefined) {
    return target;
  }

  // Handle primitives
  const t = typeof target;
  if (t === 'string') {
    const str = target as string;
    if (str.length > limits.maxMessageLength) {
      return `${str.substring(0, limits.maxMessageLength)}... [truncated ${str.length - limits.maxMessageLength} chars]`;
    }
    return str;
  }

  if (t === 'number' || t === 'boolean') {
    if (t === 'number' && (Number.isNaN(target) || !Number.isFinite(target))) {
      return String(target);
    }
    return target;
  }

  if (t === 'bigint') {
    return (target as bigint).toString();
  }

  if (t === 'symbol') {
    return (target as symbol).toString();
  }

  if (t === 'function') {
    return '[Function]';
  }

  if (t === 'object') {
    // Check nesting depth
    if (currentDepth >= limits.maxMetadataDepth) {
      return '[Max depth reached]';
    }

    // Circular reference protection
    if (visited.has(target as object)) {
      return '[Circular]';
    }
    visited.add(target as object);

    // Handle Error objects
    if (target instanceof Error) {
      const errObj: Record<string, unknown> = {
        name: target.name,
        message: target.message.length > limits.maxMessageLength
          ? `${target.message.substring(0, limits.maxMessageLength)}... [truncated]`
          : target.message,
      };
      if (target.stack) {
        errObj.stack_trace = target.stack.length > limits.maxMessageLength * 2
          ? `${target.stack.substring(0, limits.maxMessageLength * 2)}... [truncated]`
          : target.stack;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const errAny = target as any;
      if (errAny.code !== undefined) {
        errObj.code = errAny.code;
      }
      return errObj;
    }

    // Handle Date objects
    if (target instanceof Date) {
      return Number.isNaN(target.getTime()) ? 'Invalid Date' : target.toISOString();
    }

    // Handle RegExp
    if (target instanceof RegExp) {
      return target.toString();
    }

    // Handle Arrays
    if (Array.isArray(target)) {
      const arr = target as unknown[];
      const outputLength = Math.min(arr.length, limits.maxArrayLength);
      const result: unknown[] = [];
      for (let i = 0; i < outputLength; i++) {
        result.push(sanitizeMetadata(arr[i], limits, currentDepth + 1, visited));
      }
      if (arr.length > limits.maxArrayLength) {
        result.push(`[... ${arr.length - limits.maxArrayLength} items truncated]`);
      }
      return result;
    }

    // Handle Plain Objects
    const entries = Object.entries(target as Record<string, unknown>);
    const resultObj: Record<string, unknown> = {};
    const maxEntries = Math.min(entries.length, limits.maxObjectEntries);

    for (let i = 0; i < maxEntries; i++) {
      const entry = entries[i];
      if (!entry) continue;
      const [key, value] = entry;
      // Skip undefined values to avoid schema validation noise
      if (value === undefined) continue;
      resultObj[key] = sanitizeMetadata(value, limits, currentDepth + 1, visited);
    }

    if (entries.length > limits.maxObjectEntries) {
      resultObj['__truncated_entries__'] = `${entries.length - limits.maxObjectEntries} entries omitted`;
    }

    return resultObj;
  }

  return String(target);
}

/**
 * Truncates and sanitizes a top-level log message string.
 */
export function sanitizeMessage(message: unknown, maxLength: number): string {
  if (typeof message === 'string') {
    if (message.length > maxLength) {
      return `${message.substring(0, maxLength)}... [truncated ${message.length - maxLength} chars]`;
    }
    return message;
  }
  if (message === null || message === undefined) {
    return '';
  }
  const str = String(message);
  if (str.length > maxLength) {
    return `${str.substring(0, maxLength)}... [truncated ${str.length - maxLength} chars]`;
  }
  return str;
}
