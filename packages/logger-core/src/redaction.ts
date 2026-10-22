/**
 * Skyra Sensitive Data Redaction Engine
 * Prevents credentials, JWTs, API keys, cookies, connection strings,
 * and PII from leaking into JSONL log files.
 */

export const REDACTED_MASK = '[REDACTED]';

const SENSITIVE_WORDS = [
  'password',
  'passwd',
  'secret',
  'token',
  'authorization',
  'cookie',
  'creditcard',
  'cardnumber',
  'cvv',
  'ssn',
  'pan',
  'apikey',
  'privatekey',
  'secretkey',
  'connectionstring',
  'connstr',
];

const BENIGN_KEYS = new Set([
  'key',
  'keys',
  'primarykey',
  'foreignkey',
  'sortkey',
  'partitionkey',
  'cachekey',
  'idkey',
  'keypath',
  'keyboard',
  'keyevent',
  'span',
  'spanid',
  'spans',
]);

/**
 * Checks whether a property key is sensitive regardless of casing convention
 * (camelCase, snake_case, kebab-case, or UPPERCASE).
 */
export function isSensitiveKey(key: string): boolean {
  if (!key || typeof key !== 'string') return false;

  const clean = key.trim().toLowerCase().replace(/[-_.]/g, '');

  if (BENIGN_KEYS.has(clean)) {
    return false;
  }

  // Exact or compound match
  return SENSITIVE_WORDS.some((word) => clean.includes(word));
}

// Sensitive value patterns
const SENSITIVE_VALUE_REGEXES: Array<{ pattern: RegExp; replacer: (match: string, ...args: string[]) => string }> = [
  // 1. Private Key PEM blocks
  {
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    replacer: () => REDACTED_MASK,
  },
  // 2. Bearer tokens
  {
    pattern: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
    replacer: () => `Bearer ${REDACTED_MASK}`,
  },
  // 3. Raw JWT tokens (three-part Base64URL starting with eyJ)
  {
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\b/g,
    replacer: () => REDACTED_MASK,
  },
  // 4. URL embedded credentials (e.g. postgres://user:password@host:5432/db)
  {
    pattern: /([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)([^:\s\/]+):([^@\s\/]+)@/g,
    replacer: (_m, scheme, user) => `${scheme}${user}:${REDACTED_MASK}@`,
  },
  // 5. Sensitive URL query parameters (e.g. ?token=xyz or &password=xyz)
  {
    pattern: /([?&](?:password|passwd|pwd|token|secret|api[_-]?key|access[_-]?token|refresh[_-]?token)=)[^&\s"']+/gi,
    replacer: (_m, prefix) => `${prefix}${REDACTED_MASK}`,
  },
  // 6. 16-digit credit card numbers (PAN)
  {
    pattern: /\b(?:\d{4}[ -]?){3}\d{4}\b/g,
    replacer: () => REDACTED_MASK,
  },
];

/**
 * Checks whether an object or string contains unredacted sensitive keys or values.
 * Recursion-safe with circular reference tracking.
 */
export function auditSensitiveData(
  target: unknown,
  currentPath = '$',
  visited = new WeakSet<object>()
): { sensitive: boolean; detectedPaths: string[] } {
  const detectedPaths: string[] = [];

  function walk(val: unknown, path: string) {
    if (val === null || val === undefined) return;

    if (typeof val === 'string') {
      for (const { pattern } of SENSITIVE_VALUE_REGEXES) {
        pattern.lastIndex = 0;
        if (pattern.test(val)) {
          detectedPaths.push(`${path} (pattern match)`);
          break;
        }
      }
      return;
    }

    if (typeof val === 'object') {
      if (visited.has(val)) {
        return; // Circular reference - ignore in audit
      }
      visited.add(val);

      if (Array.isArray(val)) {
        val.forEach((item, index) => walk(item, `${path}[${index}]`));
        return;
      }

      const record = val as Record<string, unknown>;
      for (const [k, v] of Object.entries(record)) {
        const subPath = `${path}.${k}`;
        if (isSensitiveKey(k)) {
          if (v !== REDACTED_MASK) {
            detectedPaths.push(subPath);
          }
        }
        walk(v, subPath);
      }
    }
  }

  walk(target, currentPath);

  return {
    sensitive: detectedPaths.length > 0,
    detectedPaths,
  };
}

/**
 * Deep clones and redacts sensitive keys and values from an arbitrary data structure.
 * Protected against circular references, large strings, and invalid objects.
 * Non-mutating: creates a sanitized deep clone.
 */
export function redactSensitiveData<T = unknown>(
  target: T,
  mask = REDACTED_MASK,
  visited = new WeakMap<object, unknown>()
): T {
  if (target === null || target === undefined) {
    return target;
  }

  if (typeof target === 'string') {
    let sanitized: string = target;
    for (const { pattern, replacer } of SENSITIVE_VALUE_REGEXES) {
      pattern.lastIndex = 0;
      sanitized = sanitized.replace(pattern, replacer);
    }
    return sanitized as unknown as T;
  }

  if (typeof target === 'object') {
    // Circular reference protection
    if (visited.has(target)) {
      return visited.get(target) as T;
    }

    if (Array.isArray(target)) {
      const copyArray: unknown[] = [];
      visited.set(target, copyArray);
      for (const item of target) {
        copyArray.push(redactSensitiveData(item, mask, visited));
      }
      return copyArray as unknown as T;
    }

    // Handle Error objects
    if (target instanceof Error) {
      const copyError: Record<string, unknown> = {
        name: target.name,
        message: redactSensitiveData(target.message, mask, visited),
      };
      if (target.stack) {
        copyError.stack = redactSensitiveData(target.stack, mask, visited);
      }
      visited.set(target, copyError);
      return copyError as unknown as T;
    }

    const copyObj: Record<string, unknown> = {};
    visited.set(target, copyObj);

    for (const [key, value] of Object.entries(target as Record<string, unknown>)) {
      if (isSensitiveKey(key)) {
        copyObj[key] = mask;
      } else {
        copyObj[key] = redactSensitiveData(value, mask, visited);
      }
    }
    return copyObj as T;
  }

  return target;
}
