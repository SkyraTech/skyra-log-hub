import type { BffSession } from './session.model.js';

export const SESSION_STORE_PORT = Symbol('SESSION_STORE_PORT');

export interface ISessionStore {
  get(sessionId: string): Promise<BffSession | null>;
  /** Login creation only; never an upsert or a context update. */
  set(sessionId: string, session: BffSession, ttlMs?: number): Promise<void>;
  delete(sessionId: string): Promise<void>;
  touch(sessionId: string, newLastActivityAt: Date): Promise<boolean>;
  updateContext(sessionId:string,session:BffSession):Promise<void>;
  rotate(oldSessionId:string,newSessionId:string,csrfToken:string):Promise<BffSession|null>;
  cleanup(limit?:number):Promise<{sessions:number;logins:number}>;
  healthy():Promise<boolean>;
}
