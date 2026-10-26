import * as path from 'node:path';
import * as fs from 'node:fs';
import { Injectable, Logger } from '@nestjs/common';
import { PathTraversalException } from '../../../common/errors/query.errors.js';
import { QueryConfigService } from '../../../config/query-config.service.js';

const SAFE_PATH_COMPONENT_REGEX = /^[a-zA-Z0-9_\-\.]+$/;

@Injectable()
export class PathSafetyService {
  private readonly logger = new Logger(PathSafetyService.name);
  private readonly canonicalArchiveRoot: string;

  constructor(private readonly config: QueryConfigService) {
    this.canonicalArchiveRoot = path.resolve(config.archiveRoot);
  }

  public validatePathComponent(component: string, fieldName: string): string {
    const trimmed = component.trim();
    if (!trimmed || !SAFE_PATH_COMPONENT_REGEX.test(trimmed)) {
      throw new PathTraversalException(
        `Invalid characters in ${fieldName}: "${component}". Must match pattern [a-zA-Z0-9_.-]+.`,
      );
    }
    if (trimmed.includes('..') || trimmed === '.') {
      throw new PathTraversalException(`Path traversal attempt detected in ${fieldName}: "${component}".`);
    }
    return trimmed;
  }

  public resolveAndValidateSegmentPath(
    tenantId: string,
    projectId: string,
    environment: string,
    serviceName: string,
    date: string,
    segmentFilename: string,
  ): string {
    const safeTenant = this.validatePathComponent(tenantId, 'tenantId');
    const safeProject = this.validatePathComponent(projectId, 'projectId');
    const safeEnv = this.validatePathComponent(environment, 'environment');
    const safeService = this.validatePathComponent(serviceName, 'serviceName');
    const safeDate = this.validatePathComponent(date, 'date');
    const safeFile = this.validatePathComponent(segmentFilename, 'segmentFilename');

    if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(safeDate)) {
      throw new PathTraversalException(`Invalid date partition format: "${safeDate}". Expected YYYY-MM-DD.`);
    }

    if (!safeFile.endsWith('.jsonl') && !safeFile.endsWith('.parquet')) {
      throw new PathTraversalException(`Invalid segment file extension: "${safeFile}". Expected .jsonl or .parquet.`);
    }

    const candidatePath = path.resolve(
      this.canonicalArchiveRoot,
      safeTenant,
      safeProject,
      safeEnv,
      safeService,
      safeDate,
      safeFile,
    );

    // 1. Root containment check
    if (!this.isContainedWithin(candidatePath, this.canonicalArchiveRoot)) {
      this.logger.error(`Path traversal attempt outside archive root: ${candidatePath}`);
      throw new PathTraversalException(`Security violation: candidate path escapes archive root.`);
    }

    // 2. Symlink & Junction escape check if file exists
    if (fs.existsSync(candidatePath)) {
      try {
        const realPath = fs.realpathSync(candidatePath);
        const realRoot = fs.existsSync(this.canonicalArchiveRoot)
          ? fs.realpathSync(this.canonicalArchiveRoot)
          : this.canonicalArchiveRoot;

        if (!this.isContainedWithin(realPath, realRoot)) {
          this.logger.error(`Symlink escape attempt detected: ${candidatePath} -> ${realPath}`);
          throw new PathTraversalException(`Security violation: symbolic link targets path outside archive root.`);
        }
      } catch (err: unknown) {
        if (err instanceof PathTraversalException) throw err;
        this.logger.warn(`Failed to resolve realpath for ${candidatePath}: ${String(err)}`);
      }
    }

    return candidatePath;
  }

  public isContainedWithin(targetPath: string, rootPath: string): boolean {
    const relative = path.relative(rootPath, targetPath);
    if (!relative) return false; // exactly root is not a valid segment inside root
    if (relative.startsWith('..') || path.isAbsolute(relative)) return false;
    return true;
  }
}
