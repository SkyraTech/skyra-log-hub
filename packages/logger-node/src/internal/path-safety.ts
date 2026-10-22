import * as path from 'node:path';

const KEBAB_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const INSTANCE_REGEX = /^[a-zA-Z0-9_\-\.]{1,128}$/;

export class PathSafetyError extends Error {
  constructor(message: string) {
    super(`PathSafetyError: ${message}`);
    this.name = 'PathSafetyError';
  }
}

/**
 * Validates that an identifier adheres strictly to security constraints,
 * preventing path traversal or directory escaping.
 */
export function validateProjectId(projectId: string): void {
  if (!projectId || typeof projectId !== 'string') {
    throw new PathSafetyError('projectId must be a non-empty string');
  }
  if (projectId.length > 64) {
    throw new PathSafetyError(`projectId exceeds maximum allowed length of 64 characters (got ${projectId.length})`);
  }
  if (!KEBAB_REGEX.test(projectId)) {
    throw new PathSafetyError(
      `Invalid projectId '${projectId}'. Must be lower-case kebab-case matching pattern '^[a-z0-9]+(-[a-z0-9]+)*$'`
    );
  }
}

export function validateServiceName(serviceName: string): void {
  if (!serviceName || typeof serviceName !== 'string') {
    throw new PathSafetyError('serviceName must be a non-empty string');
  }
  if (serviceName.length > 64) {
    throw new PathSafetyError(`serviceName exceeds maximum allowed length of 64 characters (got ${serviceName.length})`);
  }
  if (!KEBAB_REGEX.test(serviceName)) {
    throw new PathSafetyError(
      `Invalid serviceName '${serviceName}'. Must be lower-case kebab-case matching pattern '^[a-z0-9]+(-[a-z0-9]+)*$'`
    );
  }
}

export function validateEnvironment(environment: string): void {
  const allowed = ['production', 'staging', 'development', 'test', 'local', 'dev', 'qa'];
  if (!environment || !allowed.includes(environment.trim().toLowerCase())) {
    throw new PathSafetyError(
      `Invalid environment '${environment}'. Must be one of: ${allowed.join(', ')}`
    );
  }
}

export function validateInstanceId(instanceId: string): void {
  if (!instanceId || typeof instanceId !== 'string') {
    throw new PathSafetyError('instanceId must be a non-empty string');
  }
  if (instanceId.length > 128) {
    throw new PathSafetyError(`instanceId exceeds maximum allowed length of 128 characters (got ${instanceId.length})`);
  }
  // Explicitly check and reject path traversal attempts
  if (instanceId.includes('..') || instanceId.includes('/') || instanceId.includes('\\') || instanceId.includes('\0')) {
    throw new PathSafetyError(`instanceId '${instanceId}' contains illegal path traversal characters ('..', '/', '\\', or null byte)`);
  }
  if (!INSTANCE_REGEX.test(instanceId)) {
    throw new PathSafetyError(
      `Invalid instanceId '${instanceId}'. Must match '^[a-zA-Z0-9_\\-\\.]+$' without spaces or path separators`
    );
  }
}

/**
 * Resolves the deterministic, fully qualified directory path adhering to contracts/storage-contract.md:
 * ${LOG_ROOT}/${PROJECT_ID}/${ENVIRONMENT}/${SERVICE_NAME}/${INSTANCE_ID}
 *
 * Verifies that the resolved path does not escape the configured LOG_ROOT.
 */
export function resolveSafeLogDirectory(
  logRoot: string,
  projectId: string,
  environment: string,
  serviceName: string,
  instanceId: string
): string {
  if (!logRoot || typeof logRoot !== 'string') {
    throw new PathSafetyError('logRoot directory must be a non-empty string');
  }
  if (logRoot.includes('\0')) {
    throw new PathSafetyError('logRoot contains illegal null byte character');
  }

  validateProjectId(projectId);
  validateEnvironment(environment);
  validateServiceName(serviceName);
  validateInstanceId(instanceId);

  const resolvedRoot = path.resolve(logRoot);
  const targetDir = path.resolve(resolvedRoot, projectId, environment, serviceName, instanceId);

  // Guarantee target directory remains strictly inside the resolved root
  const relative = path.relative(resolvedRoot, targetDir);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new PathSafetyError(`Constructed path '${targetDir}' escaped the configured root directory '${resolvedRoot}'`);
  }

  return targetDir;
}
