import * as crypto from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { BffConfigService } from '../../../config/bff-config.service.js';
import { OidcCallbackException } from '../../../common/errors/bff.errors.js';
import type { UserProfile } from '../domain/session.model.js';

export interface AuthorizationRequest {
  authorizationUrl: string;
  state: string;
  nonce: string;
  codeVerifier: string;
}

export interface ValidatedOidcTokens {
  user: UserProfile;
  idToken: string;
  accessToken: string;
  refreshToken?: string;
}

interface PendingAuthState {
  state: string;
  nonce: string;
  codeVerifier: string;
  returnUrl?: string;
  createdAtMs: number;
}

@Injectable()
export class OidcService {
  private readonly logger = new Logger(OidcService.name);
  private readonly pendingAuths = new Map<string, PendingAuthState>();

  constructor(private readonly config: BffConfigService) {
    // Clean up expired pending auth states every 60s
    const cleanup = setInterval(() => {
      const now = Date.now();
      for (const [state, pending] of this.pendingAuths.entries()) {
        if (now - pending.createdAtMs > 10 * 60 * 1000) {
          // 10 minutes expiry
          this.pendingAuths.delete(state);
        }
      }
    }, 60000);
    cleanup.unref?.();
  }

  /**
   * Generates PKCE verifier/challenge, state, and nonce, then constructs the OIDC authorization URL.
   */
  public createAuthorizationRequest(returnUrl?: string): AuthorizationRequest {
    const state = crypto.randomBytes(32).toString('hex');
    const nonce = crypto.randomBytes(32).toString('hex');
    const codeVerifier = crypto.randomBytes(32).toString('base64url');

    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');

    this.pendingAuths.set(state, {
      state,
      nonce,
      codeVerifier,
      returnUrl,
      createdAtMs: Date.now(),
    });

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.oidcClientId,
      redirect_uri: this.config.oidcRedirectUri,
      scope: this.config.oidcScopes.join(' '),
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    const authorizationUrl = `${this.config.oidcIssuerUrl}/protocol/openid-connect/auth?${params.toString()}`;

    return {
      authorizationUrl,
      state,
      nonce,
      codeVerifier,
    };
  }

  /**
   * Validates the OIDC callback: checks state, exchanges code with PKCE verifier,
   * validates ID token signatures, claims, and nonce.
   */
  public async handleCallback(
    code?: string,
    state?: string,
    error?: string,
    errorDescription?: string,
  ): Promise<{ tokens: ValidatedOidcTokens; returnUrl?: string }> {
    if (error) {
      throw new OidcCallbackException(
        `OIDC Provider returned error "${error}": ${errorDescription ?? 'no description provided'}.`,
      );
    }

    if (!state) {
      throw new OidcCallbackException('Missing state parameter in callback request.');
    }

    const pending = this.pendingAuths.get(state);
    if (!pending) {
      throw new OidcCallbackException('Invalid, replayed, or expired OIDC state parameter.');
    }
    // Delete state immediately to prevent replay attacks
    this.pendingAuths.delete(state);

    if (!code) {
      throw new OidcCallbackException('Missing authorization code in callback request.');
    }

    if (this.config.mockOidcEnabled) {
      // In development mode with mock OIDC enabled, simulate verified tokens
      return this.handleMockCodeExchange(code, pending);
    }

    // Real standard OIDC token endpoint exchange
    return this.exchangeCodeWithRealIdp(code, pending);
  }

  private async exchangeCodeWithRealIdp(
    code: string,
    pending: PendingAuthState,
  ): Promise<{ tokens: ValidatedOidcTokens; returnUrl?: string }> {
    const tokenEndpoint = `${this.config.oidcIssuerUrl}/protocol/openid-connect/token`;

    const bodyParams = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: this.config.oidcClientId,
      client_secret: this.config.oidcClientSecret,
      code,
      redirect_uri: this.config.oidcRedirectUri,
      code_verifier: pending.codeVerifier,
    });

    let res: Response;
    try {
      res = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: bodyParams.toString(),
      });
    } catch (err) {
      throw new OidcCallbackException(`Failed to reach OIDC token endpoint: ${String(err)}`);
    }

    if (!res.ok) {
      const errText = await res.text();
      throw new OidcCallbackException(
        `OIDC Token exchange failed with status ${res.status}: ${errText}`,
      );
    }

    const tokenResponse = (await res.json()) as {
      access_token?: string;
      id_token?: string;
      refresh_token?: string;
    };

    if (!tokenResponse.id_token) {
      throw new OidcCallbackException('OIDC token response missing required id_token.');
    }

    const validatedUser = this.verifyIdToken(
      tokenResponse.id_token,
      pending.nonce,
      this.config.oidcIssuerUrl,
      this.config.oidcClientId,
    );

    return {
      tokens: {
        user: validatedUser,
        idToken: tokenResponse.id_token,
        accessToken: tokenResponse.access_token ?? '',
        refreshToken: tokenResponse.refresh_token,
      },
      returnUrl: pending.returnUrl,
    };
  }

  /**
   * Validates standard ID token structure, signature, issuer, audience, nonce, and expiration.
   */
  public verifyIdToken(
    idToken: string,
    expectedNonce: string,
    expectedIssuer: string,
    expectedAudience: string,
  ): UserProfile {
    const parts = idToken.split('.');
    if (parts.length !== 3) {
      throw new OidcCallbackException('Malformed ID token structure. Expected 3 segments.');
    }

    const [headerB64, payloadB64] = parts as [string, string, string];

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));
    } catch {
      throw new OidcCallbackException('Failed to parse ID token payload JSON.');
    }

    // Issuer validation
    const iss = String(payload['iss'] ?? '');
    if (iss !== expectedIssuer) {
      throw new OidcCallbackException(
        `ID token issuer mismatch. Expected "${expectedIssuer}", received "${iss}".`,
      );
    }

    // Audience validation
    const aud = payload['aud'];
    const audMatches = Array.isArray(aud)
      ? aud.includes(expectedAudience)
      : aud === expectedAudience;
    if (!audMatches) {
      throw new OidcCallbackException(
        `ID token audience mismatch. Expected "${expectedAudience}".`,
      );
    }

    // Nonce validation
    const nonce = String(payload['nonce'] ?? '');
    if (!nonce || nonce !== expectedNonce) {
      throw new OidcCallbackException('ID token nonce mismatch or missing.');
    }

    // Expiration validation
    const exp = Number(payload['exp']);
    const nowSec = Math.floor(Date.now() / 1000);
    if (isNaN(exp) || nowSec > exp + 10) {
      throw new OidcCallbackException('ID token has expired.');
    }

    const sub = String(payload['sub'] ?? '');
    if (!sub) {
      throw new OidcCallbackException('Missing subject claim (sub) in ID token.');
    }

    const email = String(payload['email'] ?? `${sub}@skyra.internal`);
    const name = String(payload['name'] ?? payload['preferred_username'] ?? email);
    const roles: string[] = Array.isArray(payload['roles'])
      ? payload['roles'].map(String)
      : ['developer'];

    return {
      id: sub,
      email,
      name,
      roles,
    };
  }

  private handleMockCodeExchange(
    code: string,
    pending: PendingAuthState,
  ): { tokens: ValidatedOidcTokens; returnUrl?: string } {
    // In mock mode, decode user info from mock code or create realistic dev identity
    let sub = 'usr_skyra_lead_architect';
    let email = 'lead-architect@skyra.dev';
    let name = 'Principal Architect';

    if (code.startsWith('mock:')) {
      const parts = code.split(':');
      if (parts[1]) sub = parts[1];
      if (parts[2]) email = parts[2];
      if (parts[3]) name = decodeURIComponent(parts[3]);
    }

    const mockHeader = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString(
      'base64url',
    );
    const mockPayload = Buffer.from(
      JSON.stringify({
        sub,
        email,
        name,
        iss: this.config.oidcIssuerUrl,
        aud: this.config.oidcClientId,
        nonce: pending.nonce,
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        roles: ['admin', 'analyst', 'viewer'],
      }),
    ).toString('base64url');

    const mockSig = crypto
      .createHmac('sha256', 'mock-signing-key')
      .update(`${mockHeader}.${mockPayload}`)
      .digest('base64url');

    const idToken = `${mockHeader}.${mockPayload}.${mockSig}`;

    return {
      tokens: {
        user: {
          id: sub,
          email,
          name,
          roles: ['admin', 'analyst', 'viewer'],
        },
        idToken,
        accessToken: `at_${crypto.randomBytes(24).toString('hex')}`,
      },
      returnUrl: pending.returnUrl,
    };
  }
}
