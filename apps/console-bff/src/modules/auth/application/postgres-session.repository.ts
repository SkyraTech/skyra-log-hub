import crypto from 'node:crypto';
import { Pool } from 'pg';
import { ServiceUnavailableException, ConflictException, UnauthorizedException } from '@nestjs/common';
import type { BffSession } from '../domain/session.model.js';
const validToken = (token: string) => typeof token === 'string' && /^[a-f0-9]{64}$/.test(token);
const digest = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
export interface DurableSessionOptions {
    url: string;
    key: string;
    idleMs: number;
    absoluteMs: number;
    issuer: string;
    clientId: string;
}
/** No memory cache. Every shared-state transition is conditional in PostgreSQL. */
export class PostgresSessionRepository {
    private readonly pool: Pool;
    private readonly key: Buffer;
    constructor(private readonly options: DurableSessionOptions) {
        if (!options.issuer || !options.clientId)
            throw Error('Session issuer/client binding required');
        if (!options.url || !/^[a-f0-9]{64}$/.test(options.key))
            throw Error('Explicit session database and independent 256-bit data key required');
        const url = new URL(options.url);
        if (url.protocol !== 'postgresql:' || decodeURIComponent(url.username) !== 'skyra_bff_sessions_runtime')
            throw Error('Dedicated BFF session database role required');
        for (const value of [options.idleMs, options.absoluteMs])
            if (!Number.isSafeInteger(value) || value < 1 || value > 86400000)
                throw Error('Session lifetime must be bounded to 24 hours');
        this.key = Buffer.from(options.key, 'hex');
        this.pool = new Pool({ connectionString: options.url, max: 8, connectionTimeoutMillis: 3000, query_timeout: 5000, statement_timeout: 4000, application_name: 'skyra-console-session' });
        this.pool.on('error', () => {
        }); // Individual operations surface a sanitized 503; never log connection material.
    }
    private seal(value: unknown, aad: string): string {
        const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
        cipher.setAAD(Buffer.from(aad));
        const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
        return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
    }
    private open(value: string, aad: string): any {
        const [version, iv, tag, data, ...extra] = value.split('.');
        if (version !== 'v1' || !iv || !tag || !data || extra.length)
            throw Error('Invalid encrypted record');
        const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64url'));
        decipher.setAAD(Buffer.from(aad));
        decipher.setAuthTag(Buffer.from(tag, 'base64url'));
        return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8'));
    }
    private async safely<T>(work: () => Promise<T>): Promise<T> {
        try {
            return await work();
        }
        catch (e) {
            if (e instanceof ConflictException || e instanceof UnauthorizedException)
                throw e;
            throw new ServiceUnavailableException('Authoritative session store is temporarily unavailable.');
        }
    }
    async initialize() {
        await this.safely(async () => {
            const role = (await this.pool.query("SELECT current_user AS name,rolsuper,rolcreaterole,rolcreatedb,rolbypassrls FROM pg_roles WHERE rolname=current_user")).rows[0];
            if (role?.name !== 'skyra_bff_sessions_runtime' || role.rolsuper || role.rolcreaterole || role.rolcreatedb || role.rolbypassrls)
                throw Error('Unsafe session runtime');
            await this.pool.query('SELECT token_digest,encrypted_data,created_at,last_activity_at,absolute_expires_at,idle_expires_at,version,revoked_at FROM bff_sessions LIMIT 0');
            await this.pool.query('SELECT state_digest,encrypted_data,created_at,expires_at,consumed_at FROM bff_login_transactions LIMIT 0');
        });
    }
    async health(): Promise<boolean> {
        try {
            await this.initialize();
            return true;
        }
        catch {
            return false;
        }
    }
    async close() {
        await this.pool.end();
        this.key.fill(0);
    }
    private minimal(s: BffSession) {
        return { issuer: this.options.issuer, clientId: this.options.clientId, user: { id: s.user.id, email: s.user.email, name: s.user.name }, csrfToken: s.csrfToken, activeTenantId: s.activeTenantId, activeProjectId: s.activeProjectId };
    }
    private hydrate(token: string, row: any): BffSession {
        const data = this.open(row.encrypted_data, 'session/' + digest(token));
        if (data.issuer !== this.options.issuer || data.clientId !== this.options.clientId)
            throw new UnauthorizedException('Session belongs to a different authentication configuration.');
        if (!data.user?.id || typeof data.csrfToken !== 'string')
            throw Error('Invalid session payload');
        return { ...data, sessionId: token, user: { ...data.user, roles: [] }, memberships: [], createdAt: new Date(row.created_at), lastActivityAt: new Date(row.last_activity_at), version: row.version, absoluteExpiresAt: new Date(row.absolute_expires_at), idleExpiresAt: new Date(row.idle_expires_at) };
    }
    async get(token: string): Promise<BffSession | null> {
        if (!validToken(token))
            return null;
        return this.safely(async () => {
            const row = (await this.pool.query('SELECT * FROM bff_sessions WHERE token_digest=$1 AND revoked_at IS NULL AND absolute_expires_at>clock_timestamp() AND idle_expires_at>clock_timestamp()', [digest(token)])).rows[0];
            return row ? this.hydrate(token, row) : null;
        });
    }
    async create(token: string, session: BffSession, ttlMs = this.options.absoluteMs): Promise<void> {
        if (!validToken(token))
            throw Error('Invalid generated session identifier');
        const lifetime = Math.min(ttlMs, this.options.absoluteMs);
        if (!Number.isSafeInteger(lifetime) || lifetime < 1)
            throw Error('Invalid session lifetime');
        await this.safely(async () => {
            await this.pool.query(`WITH stamp AS (SELECT clock_timestamp() AS at) INSERT INTO bff_sessions(token_digest,encrypted_data,created_at,last_activity_at,absolute_expires_at,idle_expires_at) SELECT $1,$2,at,at,at+$3*interval '1 millisecond',at+$4*interval '1 millisecond' FROM stamp`, [digest(token), this.seal(this.minimal(session), 'session/' + digest(token)), lifetime, Math.min(lifetime, this.options.idleMs)]);
        });
    }
    async revoke(token: string): Promise<void> {
        if (!validToken(token))
            return;
        await this.safely(async () => {
            await this.pool.query('UPDATE bff_sessions SET revoked_at=COALESCE(revoked_at,clock_timestamp()),version=version+1 WHERE token_digest=$1', [digest(token)]);
        });
    }
    async touch(token: string): Promise<boolean> {
        if (!validToken(token))
            return false;
        return this.safely(async () => {
            const result = await this.pool.query(`UPDATE bff_sessions SET last_activity_at=GREATEST(last_activity_at,clock_timestamp()),idle_expires_at=LEAST(absolute_expires_at,GREATEST(idle_expires_at,clock_timestamp()+$2*interval '1 millisecond')) WHERE token_digest=$1 AND revoked_at IS NULL AND absolute_expires_at>clock_timestamp() AND idle_expires_at>clock_timestamp()`, [digest(token), this.options.idleMs]);
            return result.rowCount === 1;
        });
    }
    async updateContext(token: string, session: BffSession): Promise<void> {
        if (!validToken(token))
            throw new ConflictException('Session context changed.');
        await this.safely(async () => {
            const client = await this.pool.connect();
            try {
                await client.query('BEGIN');
                const row = (await client.query('SELECT * FROM bff_sessions WHERE token_digest=$1 AND revoked_at IS NULL AND absolute_expires_at>clock_timestamp() AND idle_expires_at>clock_timestamp() FOR UPDATE', [digest(token)])).rows[0];
                if (!row || row.version !== session.version)
                    throw new ConflictException('Session context changed; reload before retrying.');
                const original = this.hydrate(token, row);
                if (original.user.id !== session.user.id)
                    throw new ConflictException('Session identity cannot change.');
                original.activeTenantId = session.activeTenantId;
                original.activeProjectId = session.activeProjectId;
                await client.query('UPDATE bff_sessions SET encrypted_data=$2,version=version+1 WHERE token_digest=$1', [digest(token), this.seal(this.minimal(original), 'session/' + digest(token))]);
                await client.query('COMMIT');
            }
            catch (e) {
                await client.query('ROLLBACK').catch(() => {
                });
                throw e;
            }
            finally {
                client.release();
            }
        });
    }
    async rotate(oldToken: string, newToken: string, csrfToken: string): Promise<BffSession | null> {
        if (!validToken(oldToken) || !validToken(newToken) || oldToken === newToken)
            return null;
        return this.safely(async () => {
            const client = await this.pool.connect();
            try {
                await client.query('BEGIN');
                const row = (await client.query('SELECT * FROM bff_sessions WHERE token_digest=$1 AND revoked_at IS NULL AND absolute_expires_at>clock_timestamp() AND idle_expires_at>clock_timestamp() FOR UPDATE', [digest(oldToken)])).rows[0];
                if (!row) {
                    await client.query('ROLLBACK');
                    return null;
                }
                const session = this.hydrate(oldToken, row);
                session.csrfToken = csrfToken;
                await client.query('UPDATE bff_sessions SET revoked_at=clock_timestamp(),version=version+1 WHERE token_digest=$1', [digest(oldToken)]);
                await client.query('INSERT INTO bff_sessions(token_digest,encrypted_data,created_at,last_activity_at,absolute_expires_at,idle_expires_at) VALUES($1,$2,$3,$4,$5,$6)', [digest(newToken), this.seal(this.minimal(session), 'session/' + digest(newToken)), row.created_at, row.last_activity_at, row.absolute_expires_at, row.idle_expires_at]);
                await client.query('COMMIT');
                return { ...session, sessionId: newToken, version: 1 };
            }
            catch (e) {
                await client.query('ROLLBACK').catch(() => {
                });
                throw e;
            }
            finally {
                client.release();
            }
        });
    }
    async putLogin(state: string, pending: unknown): Promise<void> {
        if (!validToken(state))
            throw Error('Invalid generated login state');
        await this.safely(async () => {
            const client = await this.pool.connect();
            try {
                await client.query('BEGIN');
                await client.query("SELECT pg_advisory_xact_lock(hashtextextended('skyra-bff-login-capacity',0))");
                const active = (await client.query('SELECT count(*)::int AS total FROM bff_login_transactions WHERE consumed_at IS NULL AND expires_at>clock_timestamp()')).rows[0].total;
                if (active >= 1000)
                    throw new ServiceUnavailableException('Login capacity reached; retry later.');
                await client.query("WITH stamp AS (SELECT clock_timestamp() AS at) INSERT INTO bff_login_transactions(state_digest,encrypted_data,created_at,expires_at) SELECT $1,$2,at,at+interval '10 minutes' FROM stamp", [digest(state), this.seal(pending, 'login/' + digest(state))]);
                await client.query('COMMIT');
            }
            catch (e) {
                await client.query('ROLLBACK').catch(() => {
                });
                throw e;
            }
            finally {
                client.release();
            }
        });
    }
    async consumeLogin(state: string): Promise<any | null> {
        if (!validToken(state))
            return null;
        return this.safely(async () => {
            const row = (await this.pool.query('UPDATE bff_login_transactions SET consumed_at=clock_timestamp() WHERE state_digest=$1 AND consumed_at IS NULL AND expires_at>clock_timestamp() RETURNING encrypted_data', [digest(state)])).rows[0];
            return row ? this.open(row.encrypted_data, 'login/' + digest(state)) : null;
        });
    }
    async cleanup(limit = 100): Promise<{
        sessions: number;
        logins: number;
    }> {
        if (!Number.isInteger(limit) || limit < 1 || limit > 500)
            throw Error('Cleanup batch must be 1..500');
        return this.safely(async () => {
            const sessions = await this.pool.query(`WITH doomed AS (SELECT id FROM bff_sessions WHERE revoked_at IS NOT NULL OR LEAST(absolute_expires_at,idle_expires_at)<=clock_timestamp() ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED) DELETE FROM bff_sessions s USING doomed d WHERE s.id=d.id`, [limit]);
            const logins = await this.pool.query(`WITH doomed AS (SELECT state_digest FROM bff_login_transactions WHERE consumed_at IS NOT NULL OR expires_at<=clock_timestamp() ORDER BY state_digest LIMIT $1 FOR UPDATE SKIP LOCKED) DELETE FROM bff_login_transactions s USING doomed d WHERE s.state_digest=d.state_digest`, [limit]);
            return { sessions: sessions.rowCount ?? 0, logins: logins.rowCount ?? 0 };
        });
    }
}
