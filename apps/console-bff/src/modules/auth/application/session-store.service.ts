import { Inject, Injectable, Optional, type OnModuleInit, type OnModuleDestroy, ConflictException } from '@nestjs/common';
import type { ISessionStore } from '../domain/session-store.port.js';
import type { BffSession } from '../domain/session.model.js';
import { BffConfigService } from '../../../config/bff-config.service.js';
import { PostgresSessionRepository } from './postgres-session.repository.js';
import { MemorySessionStore } from './memory-session.store.js';
@Injectable()
export class SessionStoreService implements ISessionStore, OnModuleInit, OnModuleDestroy {
    private readonly persistent?: PostgresSessionRepository;
    private readonly memory?: MemorySessionStore;
    private readonly logins = new Map<string, any>();
    private cleanupTimer?: NodeJS.Timeout;
    constructor(
    @Optional()
    config?: BffConfigService,
    @Optional()
    @Inject('SESSION_MEMORY_UNIT_TEST')
    unitTest?: boolean) {
        if (unitTest === true) {
            if (process.env['NODE_ENV'] === 'production')
                throw Error('Unit session store forbidden in production');
            this.memory = new MemorySessionStore();
            return;
        }
        if (!config)
            throw Error('Session persistence configuration required');
        if (config.sessionStoreBackend === 'memory-test') {
            if (process.env['NODE_ENV'] !== 'test' || process.env['SKYRA_ISOLATED_TEST_ENV'] !== 'true')
                throw Error('Memory session store requires explicit isolated test environment');
            this.memory = new MemorySessionStore();
            return;
        }
        if(config.sessionStoreBackend==='postgres'){
            if(!config.useAuthoritativeMembership)throw Error('Durable sessions require authoritative membership');
            if(config.mockOidcEnabled&&!(config.nodeEnv==='test'&&process.env['SKYRA_ISOLATED_TEST_ENV']==='true'))throw Error('Durable sessions require verified OIDC outside isolated tests');
        }
        if (config.sessionStoreBackend !== 'postgres')
            throw Error('Unsupported session backend');
        this.persistent = new PostgresSessionRepository({ url: config.sessionDatabaseUrl, key: config.sessionDataKey, idleMs: config.sessionIdleTimeoutMs, absoluteMs: config.sessionAbsoluteLifetimeMs, issuer: config.oidcIssuerUrl, clientId: config.oidcClientId });
    }
    static forIsolatedTests() {
        return new SessionStoreService(undefined, true);
    }
    async onModuleInit() {
        await this.persistent?.initialize();
        if (this.persistent) {
            this.cleanupTimer = setInterval(() => {
                void this.cleanup(100).catch(() => {
                });
            }, 60000);
            this.cleanupTimer.unref();
        }
    }
    async onModuleDestroy() {
        if (this.cleanupTimer)
            clearInterval(this.cleanupTimer);
        this.memory?.onModuleDestroy();
        await this.persistent?.close();
    }
    async get(id: string): Promise<BffSession | null> {
        return this.persistent ? this.persistent.get(id) : this.memory!.get(id);
    }
    async set(id: string, session: BffSession, ttlMs?: number): Promise<void> {
        if (this.persistent)
            return this.persistent.create(id, session, ttlMs);
        session.version ??= 1;
        await this.memory!.set(id, session, ttlMs);
    }
    async delete(id: string): Promise<void> {
        if (this.persistent)
            return this.persistent.revoke(id);
        await this.memory!.delete(id);
    }
    async touch(id: string, at: Date): Promise<boolean> {
        if (this.persistent)
            return this.persistent.touch(id);
        if (!await this.memory!.get(id))
            return false;
        await this.memory!.touch(id, at);
        return true;
    }
    async updateContext(id: string, session: BffSession): Promise<void> {
        if (this.persistent)
            return this.persistent.updateContext(id, session);
        const current = await this.memory!.get(id);
        if (!current)
            throw new ConflictException('Session no longer active.');
        await this.memory!.set(id, session);
    }
    async rotate(oldId: string, newId: string, csrf: string): Promise<BffSession | null> {
        if (this.persistent)
            return this.persistent.rotate(oldId, newId, csrf);
        const old = await this.memory!.get(oldId);
        if (!old)
            return null;
        await this.memory!.delete(oldId);
        const next = { ...old, sessionId: newId, csrfToken: csrf };
        await this.memory!.set(newId, next);
        return next;
    }
    async putLogin(state: string, pending: any): Promise<void> {
        if (this.persistent)
            return this.persistent.putLogin(state, pending);
        if (this.logins.size >= 1000)
            throw new ConflictException('Too many pending logins');
        this.logins.set(state, pending);
    }
    async consumeLogin(state: string): Promise<any | null> {
        if (this.persistent)
            return this.persistent.consumeLogin(state);
        const value = this.logins.get(state);
        this.logins.delete(state);
        return value ?? null;
    }
    async cleanup(limit = 100) {
        if (this.persistent)
            return this.persistent.cleanup(limit);
        const now = Date.now();
        let removed = 0;
        for (const [state, pending] of this.logins) {
            if (removed >= limit)
                break;
            if (now - pending.createdAtMs >= 600000) {
                this.logins.delete(state);
                removed++;
            }
        }
        return { sessions: 0, logins: removed };
    }
    async healthy() {
        return this.persistent ? this.persistent.health() : true;
    }
    clearAll() {
        if (!this.memory)
            throw Error('Bulk session clearing is test-only');
        this.memory.clearAll();
        this.logins.clear();
    }
    size() {
        if (!this.memory)
            throw Error('Memory size is test-only');
        return this.memory.size();
    }
}
