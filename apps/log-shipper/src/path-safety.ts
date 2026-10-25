/**
 * @skyra/log-shipper - Path Containment and Safety
 */

import * as path from 'node:path';
import * as fs from 'node:fs';

export class PathSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PathSafetyError';
  }
}

/**
 * Asserts that a target path is strictly contained within an allowed base root.
 * Resolves symlinks/junctions and ensures no path traversal outside root.
 */
export function assertPathContained(targetPath: string, rootDir: string): string {
  const resolvedRoot = path.resolve(rootDir);
  const resolvedTarget = path.resolve(targetPath);

  // Prefix containment check
  const relative = path.relative(resolvedRoot, resolvedTarget);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new PathSafetyError(
      `Path traversal rejected: target "${targetPath}" escapes allowed root "${rootDir}".`
    );
  }

  // Realpath symlink escape check if target exists
  if (fs.existsSync(resolvedTarget)) {
    const realRoot = fs.existsSync(resolvedRoot) ? fs.realpathSync(resolvedRoot) : resolvedRoot;
    const realTarget = fs.realpathSync(resolvedTarget);
    const realRelative = path.relative(realRoot, realTarget);
    if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
      throw new PathSafetyError(
        `Symlink escape rejected: real path "${realTarget}" escapes real root "${realRoot}".`
      );
    }
  }

  return resolvedTarget;
}
