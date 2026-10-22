import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scratchDir = path.resolve('C:/Users/jetti/.gemini/antigravity-ide/brain/bc9d70d4-f43f-4443-b872-4fa0f82d14e0/scratch/isolated-test');
if (fs.existsSync(scratchDir)) {
  fs.rmSync(scratchDir, { recursive: true, force: true });
}
fs.mkdirSync(scratchDir, { recursive: true });

const repoRoot = path.resolve('.');
const browserTgz = path.join(repoRoot, 'skyra-logger-browser-1.0.0.tgz');
const angularTgz = path.join(repoRoot, 'skyra-logger-angular-1.0.0.tgz');
const reactTgz = path.join(repoRoot, 'skyra-logger-react-1.0.0.tgz');

console.log('[Isolated Consumer] Verifying packed tarballs exist:');
console.log(' - Browser:', browserTgz, fs.existsSync(browserTgz));
console.log(' - Angular:', angularTgz, fs.existsSync(angularTgz));
console.log(' - React:', reactTgz, fs.existsSync(reactTgz));

const nm = path.join(scratchDir, 'node_modules', '@skyra');
fs.mkdirSync(nm, { recursive: true });

// Helper to unpack tarball into target directory
function unpackTarball(tarballPath, targetDir) {
  const tmpDir = path.join(scratchDir, 'tmp_unpack_' + Math.random().toString(36).substring(2));
  fs.mkdirSync(tmpDir, { recursive: true });
  execSync(`tar -xzf "${tarballPath}" -C "${tmpDir}"`);
  fs.cpSync(path.join(tmpDir, 'package'), targetDir, { recursive: true });
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

console.log('[Isolated Consumer] Unpacking tarballs into node_modules...');
unpackTarball(browserTgz, path.join(nm, 'logger-browser'));
unpackTarball(angularTgz, path.join(nm, 'logger-angular'));
unpackTarball(reactTgz, path.join(nm, 'logger-react'));

// Link @skyra/logger-core
const coreSrc = path.join(repoRoot, 'packages', 'logger-core');
const coreDest = path.join(nm, 'logger-core');
if (!fs.existsSync(coreDest)) {
  try {
    fs.symlinkSync(coreSrc, coreDest, 'junction');
  } catch {
    fs.cpSync(coreSrc, coreDest, { recursive: true });
  }
}

// Link dependencies using import.meta.resolve from logger-angular/logger-react
const peerDeps = [
  { name: 'react', pkg: 'react/package.json' },
  { name: 'react-dom', pkg: 'react-dom/package.json' },
  { name: '@angular/core', pkg: '@angular/core/package.json' },
  { name: '@angular/router', pkg: '@angular/router/package.json' },
  { name: '@angular/common', pkg: '@angular/common/package.json' },
  { name: '@angular/compiler', pkg: '@angular/compiler/package.json' },
  { name: 'rxjs', pkg: 'rxjs/package.json' },
  { name: 'zone.js', pkg: 'zone.js/package.json' }
];

import { createRequire } from 'node:module';

const angularReq = createRequire(path.join(repoRoot, 'packages', 'logger-angular', 'package.json'));
const reactReq = createRequire(path.join(repoRoot, 'packages', 'logger-react', 'package.json'));

for (const dep of peerDeps) {
  try {
    const req = dep.name.startsWith('@angular') || dep.name === 'rxjs' || dep.name === 'zone.js'
      ? angularReq
      : reactReq;
    const pkgPath = req.resolve(dep.pkg);
    const depSrc = path.dirname(pkgPath);
    const depDest = path.join(scratchDir, 'node_modules', dep.name);
    if (!fs.existsSync(depDest)) {
      fs.mkdirSync(path.dirname(depDest), { recursive: true });
      try {
        fs.symlinkSync(depSrc, depDest, 'junction');
      } catch {
        fs.cpSync(depSrc, depDest, { recursive: true });
      }
    }
  } catch (e) {
    console.warn('Could not resolve:', dep.pkg, e.message);
  }
}

// Write consumer package.json
fs.writeFileSync(path.join(scratchDir, 'package.json'), JSON.stringify({
  name: 'isolated-consumer-test',
  version: '1.0.0',
  type: 'module'
}, null, 2));

console.log('[Isolated Consumer] Running verification script against unpacked tarball artifacts...');

const testScript = `
import '@angular/compiler';
import 'zone.js';
import { createSkyraBrowserLogger, MemoryTransport } from '@skyra/logger-browser';
import { provideSkyraLogger, SkyraLoggerService } from '@skyra/logger-angular';
import { SkyraLoggerProvider, useSkyraLogger } from '@skyra/logger-react';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { createEnvironmentInjector, Injector } from '@angular/core';

console.log('--- 1. Testing @skyra/logger-browser from packed tarball ---');
const memoryTransport = new MemoryTransport({ maxEvents: 50 });
const browserLogger = createSkyraBrowserLogger({
  projectId: 'isolated-test-project',
  serviceName: 'isolated-browser-service',
  environment: 'staging',
  level: 'info',
  transport: memoryTransport,
  capture: { globalErrors: false, unhandledRejections: false, navigation: false }
});

browserLogger.info('Browser log test from packed tarball', {
  component: 'isolated-consumer',
  action: 'test_execution',
  outcome: 'success',
  token: 'SECRET_BEARER_TOKEN_SHOULD_BE_REDACTED'
});

await browserLogger.flush();
const events = memoryTransport.getEvents();
if (events.length !== 1) {
  throw new Error(\`Expected 1 event in memory transport, got \${events.length}\`);
}
const ev = events[0];
console.log('Captured event ID:', ev.event.id);
console.log('Captured service:', ev.service.name);
console.log('Captured message:', ev.message);
if (ev.skyra?.business?.token !== '[REDACTED]') {
  throw new Error(\`Expected redacted token, got \${ev.skyra?.business?.token}\`);
}
console.log('Browser SDK Tarball: PASS');

console.log('--- 2. Testing @skyra/logger-react from packed tarball ---');
function TestComponent() {
  const logger = useSkyraLogger();
  logger.info('React component mounted in isolated test', { component: 'ReactTarballConsumer' });
  return React.createElement('div', null, 'Hello React Tarball');
}

const reactHtml = renderToString(
  React.createElement(
    SkyraLoggerProvider,
    { logger: browserLogger },
    React.createElement(TestComponent)
  )
);
console.log('Rendered React HTML:', reactHtml);
await browserLogger.flush();
if (memoryTransport.getEvents().length !== 2) {
  throw new Error(\`Expected 2 events after React render, got \${memoryTransport.getEvents().length}\`);
}
console.log('React Integration Tarball: PASS');

console.log('--- 3. Testing @skyra/logger-angular from packed tarball ---');
const angularProviders = provideSkyraLogger({
  projectId: 'isolated-angular-project',
  serviceName: 'isolated-angular-service',
  environment: 'production',
  level: 'info',
  transport: memoryTransport,
  capture: { globalErrors: false, unhandledRejections: false, navigation: false }
});

const envInjector = createEnvironmentInjector([angularProviders], Injector.NULL);
const angularService = envInjector.get(SkyraLoggerService);
angularService.info('Angular service log from packed tarball', { component: 'AngularTarballConsumer' });
await angularService.flush();

if (memoryTransport.getEvents().length !== 3) {
  throw new Error(\`Expected 3 events after Angular test, got \${memoryTransport.getEvents().length}\`);
}
console.log('Angular Integration Tarball: PASS');

console.log('\\n*** ALL 3 TARBALLS (BROWSER, ANGULAR, REACT) VERIFIED SUCCESSFULLY IN ISOLATED CONSUMER! ***');
`;

fs.writeFileSync(path.join(scratchDir, 'verify.mjs'), testScript);

execSync('node verify.mjs', { cwd: scratchDir, stdio: 'inherit' });
console.log('[Isolated Consumer] Complete verification SUCCESS!');
