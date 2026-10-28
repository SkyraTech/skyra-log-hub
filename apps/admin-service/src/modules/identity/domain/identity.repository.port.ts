import type { UserIdentity } from './identity.model.js';

export const IDENTITY_REPOSITORY_PORT = Symbol('IDENTITY_REPOSITORY_PORT');

export interface IIdentityRepositoryPort {
  findById(id: string): Promise<UserIdentity | null>;
  findByIssuerSubject(issuer: string, subject: string): Promise<UserIdentity | null>;
  findByEmail(email: string): Promise<UserIdentity[]>;
  save(user: UserIdentity): Promise<UserIdentity>;
}
