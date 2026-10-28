import { Injectable } from '@nestjs/common';
import type { IIdentityRepositoryPort } from '../domain/identity.repository.port.js';
import type { UserIdentity } from '../domain/identity.model.js';

@Injectable()
export class InMemoryIdentityRepository implements IIdentityRepositoryPort {
  private readonly usersById = new Map<string, UserIdentity>();
  private readonly usersByIssuerSubject = new Map<string, UserIdentity>();

  public async findById(id: string): Promise<UserIdentity | null> {
    return this.usersById.get(id) ?? null;
  }

  public async findByIssuerSubject(issuer: string, subject: string): Promise<UserIdentity | null> {
    const key = `${issuer}::${subject}`;
    return this.usersByIssuerSubject.get(key) ?? null;
  }

  public async findByEmail(email: string): Promise<UserIdentity[]> {
    const target = email.toLowerCase();
    const result: UserIdentity[] = [];
    for (const u of this.usersById.values()) {
      if (u.email.toLowerCase() === target) {
        result.push(u);
      }
    }
    return result;
  }

  public async save(user: UserIdentity): Promise<UserIdentity> {
    const key = `${user.issuer}::${user.subject}`;
    const existing = this.usersByIssuerSubject.get(key);
    if (existing && existing.id !== user.id) {
      throw new Error(`Unique constraint violation: uq_users_issuer_subject already exists for ${key}`);
    }

    this.usersById.set(user.id, user);
    this.usersByIssuerSubject.set(key, user);
    return user;
  }

  public clear(): void {
    this.usersById.clear();
    this.usersByIssuerSubject.clear();
  }
}
