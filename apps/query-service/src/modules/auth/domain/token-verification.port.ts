import type { QueryPrincipal } from './principal.model.js';

export const TOKEN_VERIFICATION_PORT = Symbol('TOKEN_VERIFICATION_PORT');

export interface ITokenVerificationPort {
  /**
   * Verifies an encoded bearer token and returns an authenticated QueryPrincipal.
   * Throws UnauthorizedException if token is missing, malformed, expired, or has an invalid signature.
   */
  verifyToken(rawToken: string): Promise<QueryPrincipal>;
}
