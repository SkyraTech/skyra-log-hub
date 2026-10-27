import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import type { ISessionStore } from '../domain/session-store.port.js';
import type { BffSession } from '../domain/session.model.js';

interface StoredSessionEntry {
  session: BffSession;
  expiresAtMs: number;
}

@Injectable()
export class SessionStoreService implements ISessionStore, OnModuleDestroy {
  private readonly logger = new Logger(SessionStoreService.name);
  private readonly store = new Map<string, StoredSessionEntry>();
  private readonly cleanupInterval: NodeJS.Timeout;
  private readonly maxEntries = 10000;

  constructor() {
    // Run cleanup every 60 seconds
    this.cleanupInterval = setInterval(() => this.cleanupExpired(), 60000);
    this.cleanupInterval.unref?.();
  }

  public onModuleDestroy(): void {
    clearInterval(this.cleanupInterval);
  }

  public async get(sessionId: string): Promise<BffSession | null> {
    const entry = this.store.get(sessionId);
    if (!entry) return null;

    if (Date.now() > entry.expiresAtMs) {
      this.store.delete(sessionId);
      return null;
    }

    return entry.session;
  }

  public async set(sessionId: string, session: BffSession, ttlMs = 28800000): Promise<void> {
    // Defense in depth: bound memory store to prevent memory exhaustion
    if (this.store.size >= this.maxEntries) {
      this.cleanupExpired();
      if (this.store.size >= this.maxEntries) {
        // Evict oldest entry
        const oldestKey = this.store.keys().next().value;
        if (oldestKey) this.store.delete(oldestKey);
      }
    }

    this.store.set(sessionId, {
      session,
      expiresAtMs: Date.now() + ttlMs,
    });
  }

  public async delete(sessionId: string): Promise<void> {
    this.store.delete(sessionId);
  }

  public async touch(sessionId: string, newLastActivityAt: Date): Promise<void> {
    const entry = this.store.get(sessionId);
    if (entry) {
      entry.session.lastActivityAt = newLastActivityAt;
    }
  }

  public clearAll(): void {
    this.store.clear();
  }

  public size(): number {
    return this.store.size;
  }

  private cleanupExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAtMs) {
        this.store.delete(key);
      }
    }
  }
}
