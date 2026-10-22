/**
 * @skyra/logger-browser - Resource Limits and Sanitization Engine
 */

import type { EcsError } from '@skyra/logger-core/types';
import type { ResolvedBrowserLimits } from '../config.js';

export function sanitizeMessage(
  rawMessage: unknown,
  maxLength: number = 8192
): string {
  if (rawMessage === null || rawMessage === undefined) {
    return '[empty]';
  }

  let str: string;
  if (typeof rawMessage === 'string') {
    str = rawMessage;
  } else if (rawMessage instanceof Error) {
    str = rawMessage.message || rawMessage.name || 'Error';
  } else {
    try {
      str = String(rawMessage);
    } catch {
      str = '[unserializable message]';
    }
  }

  str = str.trim();
  if (str.length === 0) {
    return '[empty]';
  }

  if (str.length <= maxLength) {
    return str;
  }

  const suffix = '... [truncated]';
  const targetLen = Math.max(1, maxLength - suffix.length);
  // Safe Unicode surrogate pair slice
  let sliceEnd = targetLen;
  const code = str.charCodeAt(sliceEnd - 1);
  if (code >= 0xd800 && code <= 0xdbff) {
    sliceEnd--;
  }
  return str.slice(0, sliceEnd) + suffix;
}

export function extractEcsError(error: unknown): EcsError {
  if (error instanceof Error) {
    return {
      type: error.name || 'Error',
      message: error.message || 'Unknown error',
      stack_trace: error.stack ? String(error.stack).slice(0, 16384) : undefined,
    };
  }

  if (typeof error === 'object' && error !== null) {
    const errObj = error as Record<string, unknown>;
    return {
      type: typeof errObj['name'] === 'string' ? errObj['name'] : 'CustomError',
      message:
        typeof errObj['message'] === 'string'
          ? errObj['message']
          : JSON.stringify(error).slice(0, 4096),
      stack_trace:
        typeof errObj['stack'] === 'string'
          ? errObj['stack'].slice(0, 16384)
          : undefined,
    };
  }

  return {
    type: 'StringError',
    message: String(error).slice(0, 4096),
  };
}

export function sanitizeMetadata(
  input: unknown,
  limits: ResolvedBrowserLimits
): Record<string, unknown> | undefined {
  if (input === null || input === undefined || typeof input !== 'object') {
    return undefined;
  }

  const visited = new WeakSet<object>();

  function sanitizeRecursive(
    val: unknown,
    depth: number
  ): unknown {
    if (val === null || val === undefined) {
      return val;
    }

    if (depth > limits.maxMetadataDepth) {
      return '[Truncated: max depth reached]';
    }

    const type = typeof val;

    if (type === 'string') {
      const str = val as string;
      if (str.length > 4096) {
        return str.slice(0, 4096) + '... [truncated]';
      }
      return str;
    }

    if (type === 'number' || type === 'boolean') {
      if (typeof val === 'number' && !Number.isFinite(val)) {
        return String(val); // 'NaN', 'Infinity'
      }
      return val;
    }

    if (type === 'bigint') {
      return val.toString();
    }

    if (type === 'symbol' || type === 'function') {
      return `[${type}]`;
    }

    if (typeof val === 'object') {
      // Browser DOM checks (guarded)
      if (typeof window !== 'undefined' && val === window) {
        return '[Window]';
      }
      if (typeof document !== 'undefined' && val === document) {
        return '[Document]';
      }
      if (typeof Element !== 'undefined' && val instanceof Element) {
        return `[DOM Element: <${val.tagName.toLowerCase()}>]`;
      }
      if (val instanceof Date) {
        return isNaN(val.getTime()) ? '[Invalid Date]' : val.toISOString();
      }
      if (val instanceof RegExp) {
        return val.toString();
      }
      if (val instanceof Error) {
        return extractEcsError(val);
      }

      if (visited.has(val)) {
        return '[Circular]';
      }
      visited.add(val);

      if (Array.isArray(val)) {
        const arrResult: unknown[] = [];
        const count = Math.min(val.length, limits.maxArrayLength);
        for (let i = 0; i < count; i++) {
          arrResult.push(sanitizeRecursive(val[i], depth + 1));
        }
        if (val.length > limits.maxArrayLength) {
          arrResult.push(
            `[Truncated: ${val.length - limits.maxArrayLength} more items]`
          );
        }
        return arrResult;
      }

      // Plain or generic object
      const objResult: Record<string, unknown> = {};
      const entries = Object.entries(val);
      const count = Math.min(entries.length, limits.maxObjectKeys);

      for (let i = 0; i < count; i++) {
        const [k, v] = entries[i]!;
        // Disallow dangerous keys like __proto__
        if (k === '__proto__' || k === 'constructor' || k === 'prototype') {
          continue;
        }
        objResult[k] = sanitizeRecursive(v, depth + 1);
      }

      if (entries.length > limits.maxObjectKeys) {
        objResult['_truncated_keys_count'] =
          entries.length - limits.maxObjectKeys;
      }

      return objResult;
    }

    return String(val);
  }

  const result = sanitizeRecursive(input, 1);
  return typeof result === 'object' && result !== null && !Array.isArray(result)
    ? (result as Record<string, unknown>)
    : { data: result };
}
