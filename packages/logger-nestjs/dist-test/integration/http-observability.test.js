var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as http from 'node:http';
import { Controller, Get, Post, Param, BadRequestException, ForbiddenException, InternalServerErrorException, } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { parseStrictJson, validateLogEvent } from '@skyra/logger-core';
import { SkyraLoggerModule } from '../../dist/skyra-logger.module.js';
import { SkyraLoggerService } from '../../dist/skyra-logger.service.js';
let SampleApiController = class SampleApiController {
    logger;
    constructor(logger) {
        this.logger = logger;
    }
    ping() {
        this.logger.info('Ping called inside handler');
        return { message: 'pong' };
    }
    createOrder() {
        this.logger.info('Order processed inside handler', { component: 'order-service' });
        return { status: 'created', orderId: 'ord-12345' };
    }
    getUserProfile(userId) {
        this.logger.info(`Fetching user profile for ${userId}`);
        return { userId, name: 'Alice' };
    }
    triggerBadRequest() {
        throw new BadRequestException('Invalid customer payload');
    }
    triggerForbidden() {
        throw new ForbiddenException('User lacks required billing scope');
    }
    triggerServerError() {
        throw new InternalServerErrorException('Payment gateway unreachable');
    }
    triggerUnexpectedCrash() {
        throw new Error('Uncaught runtime memory access error');
    }
    healthCheck() {
        return { status: 'UP' };
    }
};
__decorate([
    Get('ping'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], SampleApiController.prototype, "ping", null);
__decorate([
    Post('orders'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], SampleApiController.prototype, "createOrder", null);
__decorate([
    Get('users/:userId/profile'),
    __param(0, Param('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], SampleApiController.prototype, "getUserProfile", null);
__decorate([
    Get('bad-request'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], SampleApiController.prototype, "triggerBadRequest", null);
__decorate([
    Get('forbidden'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], SampleApiController.prototype, "triggerForbidden", null);
__decorate([
    Get('server-error'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], SampleApiController.prototype, "triggerServerError", null);
__decorate([
    Get('unexpected-crash'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], SampleApiController.prototype, "triggerUnexpectedCrash", null);
__decorate([
    Get('health'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], SampleApiController.prototype, "healthCheck", null);
SampleApiController = __decorate([
    Controller('test'),
    __metadata("design:paramtypes", [SkyraLoggerService])
], SampleApiController);
describe('HTTP Observability & End-to-End Integration (NestJS)', () => {
    const TEST_DIR = path.resolve(process.cwd(), 'temp-test-nestjs-logs');
    let app;
    let serverUrl;
    let loggerService;
    before(async () => {
        if (fs.existsSync(TEST_DIR)) {
            fs.rmSync(TEST_DIR, { recursive: true, force: true });
        }
        fs.mkdirSync(TEST_DIR, { recursive: true });
        const moduleRef = await Test.createTestingModule({
            imports: [
                SkyraLoggerModule.forRoot({
                    projectId: 'skyra-erp',
                    serviceName: 'erp-api',
                    environment: 'test',
                    instanceId: 'inst-http-01',
                    level: 'trace',
                    transport: {
                        type: 'file',
                        directory: TEST_DIR,
                    },
                    http: {
                        enabled: true,
                        captureDuration: true,
                        excludePaths: ['/test/health'],
                    },
                }),
            ],
            controllers: [SampleApiController],
        }).compile();
        app = moduleRef.createNestApplication();
        await app.init();
        // Start HTTP server on ephemeral port
        const httpServer = await new Promise((resolve) => {
            const server = app.getHttpServer().listen(0, () => resolve(server));
        });
        const address = httpServer.address();
        if (typeof address === 'object' && address !== null) {
            serverUrl = `http://127.0.0.1:${address.port}`;
        }
        else {
            throw new Error('Failed obtaining ephemeral port');
        }
        loggerService = app.get(SkyraLoggerService);
    });
    after(async () => {
        if (app) {
            await app.close();
        }
        if (fs.existsSync(TEST_DIR)) {
            fs.rmSync(TEST_DIR, { recursive: true, force: true });
        }
    });
    function getEmittedLogs() {
        const events = [];
        const walk = (dir) => {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    walk(full);
                }
                else if (entry.name.endsWith('.jsonl')) {
                    const content = fs.readFileSync(full, 'utf-8');
                    for (const line of content.split('\n')) {
                        if (line.trim().length > 0) {
                            const parsed = parseStrictJson(line);
                            events.push(parsed);
                        }
                    }
                }
            }
        };
        if (fs.existsSync(TEST_DIR)) {
            walk(TEST_DIR);
        }
        return events;
    }
    async function makeRequest(method, route, options = {}) {
        return new Promise((resolve, reject) => {
            const url = new URL(route, serverUrl);
            const req = http.request(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers,
                },
            }, (res) => {
                let data = '';
                res.on('data', (chunk) => (data += chunk));
                res.on('end', () => resolve({
                    status: res.statusCode || 0,
                    body: data,
                    headers: res.headers,
                }));
            });
            req.on('error', reject);
            if (options.body) {
                req.write(options.body);
            }
            req.end();
        });
    }
    it('1. GET request generates valid canonical completion event with duration and W3C trace', async () => {
        const traceId = '4bf92f3577b34da6a3ce929d0e0e4736';
        const spanId = '00f067aa0ba902b7';
        const traceparent = `00-${traceId}-${spanId}-01`;
        const res = await makeRequest('GET', '/test/ping', {
            headers: {
                traceparent,
                'x-request-id': 'req-client-custom-01',
            },
        });
        assert.equal(res.status, 200);
        assert.equal(res.headers['x-request-id'], 'req-client-custom-01');
        await loggerService.flush();
        const logs = getEmittedLogs();
        const httpLog = logs.find((l) => l.event?.action === 'http.request.completed' && l.http?.route === '/test/ping');
        assert.ok(httpLog, 'Must emit http.request.completed event');
        assert.equal(httpLog.log?.level, 'info');
        assert.equal(httpLog.event?.outcome, 'success');
        assert.equal(httpLog.http?.request?.method, 'GET');
        assert.equal(httpLog.http?.response?.status_code, 200);
        assert.equal(httpLog.trace?.id, traceId);
        assert.equal(httpLog.span?.id, spanId);
        assert.ok(typeof httpLog.skyra?.duration_ms === 'number' && httpLog.skyra.duration_ms >= 0);
        assert.ok(typeof httpLog.event?.duration === 'number' && httpLog.event.duration >= 0);
        // Schema validation
        const validation = validateLogEvent(httpLog);
        assert.equal(validation.valid, true, `Log must satisfy canonical schema: ${JSON.stringify(validation.errors)}`);
    });
    it('2. POST request completes successfully and does NOT log request body', async () => {
        const sensitivePayload = JSON.stringify({
            orderId: 'ord-12345',
            password: 'PlaintextPassword123!',
            secretToken: 'secret-xyz',
        });
        const res = await makeRequest('POST', '/test/orders', {
            body: sensitivePayload,
        });
        assert.equal(res.status, 201);
        await loggerService.flush();
        const logs = getEmittedLogs();
        const httpLog = logs.find((l) => l.event?.action === 'http.request.completed' && l.http?.route === '/test/orders');
        assert.ok(httpLog);
        assert.equal(httpLog.http?.request?.method, 'POST');
        assert.equal(httpLog.http?.response?.status_code, 201);
        // Verify bodies were never logged
        const serialized = JSON.stringify(httpLog);
        assert.ok(!serialized.includes('PlaintextPassword123!'));
        assert.ok(!serialized.includes('secret-xyz'));
        const validation = validateLogEvent(httpLog);
        assert.equal(validation.valid, true);
    });
    it('3. Sanitizes route parameters (e.g. /users/:userId/profile) and excludes query strings', async () => {
        const res = await makeRequest('GET', '/test/users/998877/profile?api_key=secret-api-key&session=active_session');
        assert.equal(res.status, 200);
        await loggerService.flush();
        const logs = getEmittedLogs();
        const httpLog = logs.find((l) => l.event?.action === 'http.request.completed' && l.http?.route === '/test/users/:userId/profile');
        assert.ok(httpLog, 'Route must use sanitized template /test/users/:userId/profile');
        assert.equal(httpLog.skyra?.http?.route_template, '/test/users/:userId/profile');
        const serialized = JSON.stringify(httpLog);
        assert.ok(!serialized.includes('secret-api-key'));
        assert.ok(!serialized.includes('session=active_session'));
    });
    it('4. HTTP 400 Bad Request logs warn severity and preserves client error response', async () => {
        const res = await makeRequest('GET', '/test/bad-request');
        assert.equal(res.status, 400);
        const body = JSON.parse(res.body);
        assert.equal(body.statusCode, 400);
        assert.equal(body.message, 'Invalid customer payload');
        await loggerService.flush();
        const logs = getEmittedLogs();
        const errLog = logs.find((l) => l.event?.action === 'http.request.completed' && l.http?.route === '/test/bad-request');
        assert.ok(errLog);
        assert.equal(errLog.log?.level, 'warn');
        assert.equal(errLog.event?.outcome, 'failure');
        assert.equal(errLog.http?.response?.status_code, 400);
        assert.equal(errLog.error?.type, 'BadRequestException');
    });
    it('5. HTTP 403 Forbidden logs warn severity with error details', async () => {
        const res = await makeRequest('GET', '/test/forbidden');
        assert.equal(res.status, 403);
        await loggerService.flush();
        const logs = getEmittedLogs();
        const errLog = logs.find((l) => l.event?.action === 'http.request.completed' && l.http?.route === '/test/forbidden');
        assert.ok(errLog);
        assert.equal(errLog.log?.level, 'warn');
        assert.equal(errLog.http?.response?.status_code, 403);
        assert.equal(errLog.error?.type, 'ForbiddenException');
    });
    it('6. HTTP 500 InternalServerError logs error severity without exposing internal stack to client', async () => {
        const res = await makeRequest('GET', '/test/server-error');
        assert.equal(res.status, 500);
        const body = JSON.parse(res.body);
        assert.equal(body.statusCode, 500);
        assert.ok(!body.stack, 'Client response must never expose internal stack trace');
        await loggerService.flush();
        const logs = getEmittedLogs();
        const errLog = logs.find((l) => l.event?.action === 'http.request.completed' && l.http?.route === '/test/server-error');
        assert.ok(errLog);
        assert.equal(errLog.log?.level, 'error');
        assert.equal(errLog.http?.response?.status_code, 500);
        assert.equal(errLog.error?.type, 'InternalServerErrorException');
        assert.ok(errLog.error?.stack_trace, 'Internal log must retain sanitized stack trace');
    });
    it('7. Unexpected runtime exception produces 500 response and logs error event', async () => {
        const res = await makeRequest('GET', '/test/unexpected-crash');
        assert.equal(res.status, 500);
        const body = JSON.parse(res.body);
        assert.equal(body.statusCode, 500);
        assert.ok(!body.stack);
        await loggerService.flush();
        const logs = getEmittedLogs();
        const crashLog = logs.find((l) => l.event?.action === 'http.request.completed' && l.http?.route === '/test/unexpected-crash');
        assert.ok(crashLog);
        assert.equal(crashLog.log?.level, 'error');
        assert.equal(crashLog.http?.response?.status_code, 500);
        assert.equal(crashLog.error?.type, 'Error');
        assert.equal(crashLog.error?.message, 'Uncaught runtime memory access error');
    });
    it('8. Excluded paths (/test/health) emit ZERO completion logs', async () => {
        const beforeCount = getEmittedLogs().length;
        const res = await makeRequest('GET', '/test/health');
        assert.equal(res.status, 200);
        await loggerService.flush();
        const afterLogs = getEmittedLogs();
        const healthLog = afterLogs.find((l) => l.http?.route === '/test/health');
        assert.equal(healthLog, undefined, 'Excluded route /test/health must not generate HTTP logs');
    });
    it('9. Deduplication check: exactly ONE completion log per request', async () => {
        const logsBefore = getEmittedLogs().length;
        await makeRequest('GET', '/test/server-error');
        await loggerService.flush();
        const logsAfter = getEmittedLogs();
        const serverErrorLogs = logsAfter
            .slice(logsBefore)
            .filter((l) => l.event?.action === 'http.request.completed' && l.http?.route === '/test/server-error');
        assert.equal(serverErrorLogs.length, 1, 'Exactly one completion log must be emitted per request');
    });
    it('10. Concurrent requests receive unique request IDs without context leakage', async () => {
        const concurrency = 20;
        const promises = Array.from({ length: concurrency }, (_, i) => makeRequest('GET', '/test/ping', {
            headers: { 'x-request-id': `req-concurrent-${i}` },
        }));
        const responses = await Promise.all(promises);
        for (let i = 0; i < concurrency; i++) {
            assert.equal(responses[i].status, 200);
            assert.equal(responses[i].headers['x-request-id'], `req-concurrent-${i}`);
        }
        await loggerService.flush();
        const logs = getEmittedLogs();
        const concurrentLogs = logs.filter((l) => l.event?.action === 'http.request.completed' && l.http?.request?.id?.startsWith('req-concurrent-'));
        assert.equal(concurrentLogs.length, concurrency);
        const uniqueIds = new Set(concurrentLogs.map((l) => l.http?.request?.id));
        assert.equal(uniqueIds.size, concurrency, 'Every concurrent request must have unique request ID');
    });
});
//# sourceMappingURL=http-observability.test.js.map