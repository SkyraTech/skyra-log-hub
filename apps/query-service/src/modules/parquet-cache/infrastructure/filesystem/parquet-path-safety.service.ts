import * as path from 'node:path';
import * as fs from 'node:fs';
import { Injectable, Logger } from '@nestjs/common';
import { QueryConfigService } from '../../../../config/query-config.service.js';
import { PathTraversalException } from '../../../../common/errors/query.errors.js';

const SAFE_COMPONENT_REGEX = /^[a-zA-Z0-9_\-\.]+$/;
const DATE_PARTITION_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export interface ParquetSegmentPaths {
  readonly directory: string;
  readonly stagingDirectory: string;
  readonly parquetPath: string;
  readonly metadataPath: string;
  readonly stagingParquetPath: string;
  readonly stagingMetadataPath: string;
}

@Injectable()
export class ParquetPathSafetyService {
  private readonly logger = new Logger(ParquetPathSafetyService.name);

  constructor(private readonly config: QueryConfigService) {}

  public getCacheRoot(): string {
    return path.resolve(this.config.parquetCacheRoot);
  }

  public resolveSegmentPaths(
    tenantId: string,
    projectId: string,
    environment: string,
    date: string,
    segmentFilename: string,
    jobId?: string,
  ): ParquetSegmentPaths {
    this.validatePathComponent('tenantId', tenantId);
    this.validatePathComponent('projectId', projectId);
    this.validatePathComponent('environment', environment);
    this.validatePathComponent('date', date);
    this.validatePathComponent('segmentFilename', segmentFilename);

    if (!DATE_PARTITION_REGEX.test(date)) {
      throw new PathTraversalException(`Invalid date partition format: "${date}". Expected YYYY-MM-DD.`);
    }

    const baseName = segmentFilename.replace(/\.jsonl$/i, '');
    const parquetFilename = `${baseName}.parquet`;
    const metadataFilename = `${baseName}.meta.json`;

    const root = this.getCacheRoot();
    const directory = path.resolve(root, tenantId, projectId, environment, date);

    // Enforce root containment
    const rootWithSep = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
    if (!directory.startsWith(rootWithSep) && directory !== root) {
      throw new PathTraversalException(`Path traversal detected: directory "${directory}" escapes cache root "${root}".`);
    }

    const parquetPath = path.resolve(directory, parquetFilename);
    const metadataPath = path.resolve(directory, metadataFilename);

    if (!parquetPath.startsWith(rootWithSep) || !metadataPath.startsWith(rootWithSep)) {
      throw new PathTraversalException(`Path traversal detected: file paths escape cache root.`);
    }

    const stagingDirectory = path.resolve(directory, '.staging');
    const stagingUuid = jobId ?? `tmp-${Date.now()}`;
    const stagingParquetPath = path.resolve(stagingDirectory, `${baseName}.${stagingUuid}.tmp-conv`);
    const stagingMetadataPath = path.resolve(stagingDirectory, `${baseName}.${stagingUuid}.tmp-meta.json`);

    return {
      directory,
      stagingDirectory,
      parquetPath,
      metadataPath,
      stagingParquetPath,
      stagingMetadataPath,
    };
  }

  public ensureDirectoryExists(directoryPath: string): void {
    const root = this.getCacheRoot();
    const rootWithSep = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
    if (!directoryPath.startsWith(rootWithSep) && directoryPath !== root) {
      throw new PathTraversalException(`Cannot create directory escaping cache root: "${directoryPath}".`);
    }

    if (!fs.existsSync(directoryPath)) {
      fs.mkdirSync(directoryPath, { recursive: true });
    }
  }

  public validateParquetFileContainment(filePath: string): string {
    const root = this.getCacheRoot();
    const rootWithSep = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
    const resolved = path.resolve(filePath);

    if (!resolved.startsWith(rootWithSep)) {
      throw new PathTraversalException(`Parquet file "${resolved}" escapes cache root "${root}".`);
    }

    if (!fs.existsSync(resolved)) {
      throw new PathTraversalException(`Parquet file does not exist: "${resolved}".`);
    }

    // Resolve symlinks to prevent symlink escape
    const real = fs.realpathSync(resolved);
    if (!real.startsWith(rootWithSep)) {
      throw new PathTraversalException(`Symlink escape detected: real path "${real}" escapes cache root "${root}".`);
    }

    return real;
  }

  private validatePathComponent(name: string, val: string): void {
    if (!val || typeof val !== 'string') {
      throw new PathTraversalException(`Invalid ${name}: must be a non-empty string.`);
    }

    if (val.includes('..') || val.includes('/') || val.includes('\\') || val.includes('\0')) {
      throw new PathTraversalException(`Path traversal characters detected in ${name}: "${val}".`);
    }

    if (!SAFE_COMPONENT_REGEX.test(val)) {
      throw new PathTraversalException(`Illegal characters in ${name}: "${val}".`);
    }
  }
}
