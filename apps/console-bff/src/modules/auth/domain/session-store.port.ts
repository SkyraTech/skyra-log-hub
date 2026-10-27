import type { BffSession } from './session.model.js';

export const SESSION_STORE_PORT = Symbol('SESSION_STORE_PORT');

export interface ISessionStore {
  get(sessionId: string): Promise<BffSession | null>;
  set(sessionId: string, session: BffSession, ttlMs?: number): Promise<void>;
  delete(sessionId: string): Promise<void>;
  touch(sessionId: string, newLastActivityAt: Date): Promise<void>;
}
