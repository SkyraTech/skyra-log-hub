import { createRequire } from 'node:module';
import path from 'node:path';
import { root } from './isolated-postgres.mjs';

for (const service of ['admin-service', 'console-bff']) {
  const require = createRequire(path.join(root, 'apps', service, 'package.json'));
  const packages = ['@nestjs/common', '@nestjs/core', '@nestjs/platform-fastify', 'fastify',
    'reflect-metadata', '@skyra/logger-core', '@skyra/logger-node', '@skyra/logger-nestjs'];
  packages.push(...(service === 'admin-service' ? ['@prisma/client', 'prisma', 'pg'] : ['@fastify/cookie']));
  for (const name of packages) {
    const entry = require.resolve(name);
    console.log(`${service}: ${name} => ${path.relative(root, entry)}`);
  }
}
const require = createRequire(path.join(root, 'package.json'));
console.log(`root pg: ${require('pg/package.json').version}`);
console.log(`local tsx: ${require('tsx/package.json').version}`);
