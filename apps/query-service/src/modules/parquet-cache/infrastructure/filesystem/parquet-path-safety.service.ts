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

  public getClaimsDirectory(): string {
    const root = this.getCacheRoot();
    const claimsDir = path.resolve(root, '.claims');
    const rootWithSep = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
    if (!claimsDir.startsWith(rootWithSep) && claimsDir !== root) {
      throw new PathTraversalException(`Path traversal detected: claims directory escapes cache root.`);
    }
    this.ensureDirectoryExists(claimsDir);
    return claimsDir;
  }

  public resolveSegmentPaths(
    tenantId: string,
    projectId: string,
    environment: string,
    date: string,
    segmentFilename: string,
    jobId?: string,
    sourceChecksum?: string,
  ): ParquetSegmentPaths {
    this.validatePathComponent('tenantId', tenantId);
    this.validatePathComponent('projectId', projectId);
    this.validatePathComponent('environment', environment);
    this.validatePathComponent('date', date);
    this.validatePathComponent('segmentFilename', segmentFilename);

    if (!DATE_PARTITION_REGEX.test(date)) {
      throw new PathTraversalException(`Invalid date partition format: "${date}". Expected YYYY-MM-DD.`);
    }

    if(jobId)this.validatePathComponent('jobId',jobId);
    if(sourceChecksum&&!/^[a-f0-9]{64}$/.test(sourceChecksum))throw new PathTraversalException('Invalid source checksum namespace');
    const baseName = segmentFilename.replace(/\.jsonl$/i, '')+(sourceChecksum?'--'+sourceChecksum:'');
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

    this.rejectLinks(directory);
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

    this.rejectLinks(directoryPath);
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

    this.rejectLinks(path.dirname(resolved));
    if(fs.lstatSync(resolved).isSymbolicLink()||!fs.lstatSync(resolved).isFile())throw new PathTraversalException('Unverified Parquet file');
    // Resolve symlinks to prevent symlink escape
    const real = fs.realpathSync(resolved);
    if (!real.startsWith(rootWithSep)) {
      throw new PathTraversalException(`Symlink escape detected: real path "${real}" escapes cache root "${root}".`);
    }

    return real;
  }

  private rejectLinks(directory:string){const root=this.getCacheRoot();let current=root;if(fs.existsSync(root)&&fs.lstatSync(root).isSymbolicLink())throw new PathTraversalException('Redirected Parquet root');for(const part of path.relative(root,directory).split(path.sep).filter(Boolean)){current=path.join(current,part);if(fs.existsSync(current)&&fs.lstatSync(current).isSymbolicLink())throw new PathTraversalException('Redirected Parquet directory');}}

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
