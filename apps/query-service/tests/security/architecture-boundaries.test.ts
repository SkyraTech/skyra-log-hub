import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Clean Architecture Boundaries Audit (LOGHUB-QUERY-002 / LOGHUB-ARCH-001)', () => {
  const querySrc = fs.existsSync(path.resolve('src'))
    ? path.resolve('src')
    : path.resolve('apps', 'query-service', 'src');

  function getFilesRecursively(dir: string): string[] {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...getFilesRecursively(fullPath));
      } else if (entry.isFile() && entry.name.endsWith('.ts')) {
        files.push(fullPath);
      }
    }
    return files;
  }

  it('ARCH-1: Domain layer must NOT import from infrastructure or frameworks (@nestjs, @prisma, fastify)', () => {
    const allFiles = getFilesRecursively(querySrc);
    const domainFiles = allFiles.filter((f) => f.includes(`${path.sep}domain${path.sep}`));

    assert.ok(domainFiles.length > 0, 'Domain files must exist in apps/query-service/src');

    const forbiddenImports = ['@nestjs', '@prisma', 'fastify', 'node:fs', 'node:http'];

    for (const file of domainFiles) {
      const content = fs.readFileSync(file, 'utf8');
      for (const forbidden of forbiddenImports) {
        assert.ok(
          !content.includes(`'${forbidden}`) && !content.includes(`"${forbidden}`),
          `Domain file ${path.relative(querySrc, file)} violates clean architecture: imports ${forbidden}`,
        );
      }
    }
  });

  it('ARCH-2: Public DTOs must not expose internal disk paths', () => {
    const dtoPath = path.join(querySrc, 'modules', 'archive-discovery', 'api', 'dto', 'discovery-response.dto.ts');
    assert.ok(fs.existsSync(dtoPath), 'discovery-response.dto.ts must exist');

    const content = fs.readFileSync(dtoPath, 'utf8');
    assert.ok(
      !content.includes('resolvedPath'),
      'DiscoveredSegmentSummaryDto must not expose resolvedPath to client',
    );
  });

  it('ARCH-3: Controllers must NOT import PrismaClient, PrismaService, or database drivers', () => {
    const allFiles = getFilesRecursively(querySrc);
    const controllerFiles = allFiles.filter((f) => f.endsWith('.controller.ts'));

    assert.ok(controllerFiles.length > 0, 'Controller files must exist in apps/query-service/src');

    for (const file of controllerFiles) {
      const content = fs.readFileSync(file, 'utf8');
      assert.ok(
        !content.includes('@prisma') && !content.includes('prisma.service') && !content.includes('PrismaClient'),
        `Controller ${path.relative(querySrc, file)} violates architecture: directly imports Prisma`,
      );
    }
  });

  it('ARCH-4: Controllers must NOT import node filesystem APIs (node:fs, fs)', () => {
    const allFiles = getFilesRecursively(querySrc);
    const controllerFiles = allFiles.filter((f) => f.endsWith('.controller.ts'));

    for (const file of controllerFiles) {
      const content = fs.readFileSync(file, 'utf8');
      assert.ok(
        !content.includes("'node:fs'") && !content.includes('"node:fs"') &&
        !content.includes("'fs'") && !content.includes('"fs"'),
        `Controller ${path.relative(querySrc, file)} violates architecture: directly imports filesystem APIs`,
      );
    }
  });

  it('ARCH-5: Controllers must remain thin HTTP adapters (<= 120 lines)', () => {
    const allFiles = getFilesRecursively(querySrc);
    const controllerFiles = allFiles.filter((f) => f.endsWith('.controller.ts'));

    for (const file of controllerFiles) {
      const content = fs.readFileSync(file, 'utf8');
      const lineCount = content.split('\n').length;
      assert.ok(
        lineCount <= 120,
        `Controller ${path.relative(querySrc, file)} exceeds maximum thin-controller ceiling of 120 lines (${lineCount} lines)`,
      );
    }
  });

  it('ARCH-6: Query Service must NOT import from ingestion-gateway application internals', () => {
    const allFiles = getFilesRecursively(querySrc);

    for (const file of allFiles) {
      const content = fs.readFileSync(file, 'utf8');
      assert.ok(
        !content.includes('ingestion-gateway'),
        `File ${path.relative(querySrc, file)} violates service boundary: imports from ingestion-gateway`,
      );
    }
  });
});

