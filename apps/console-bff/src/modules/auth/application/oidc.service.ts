import * as crypto from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { BffConfigService } from '../../../config/bff-config.service.js';
import { OidcCallbackException } from '../../../common/errors/bff.errors.js';
import type { UserProfile } from '../domain/session.model.js';
import {SessionStoreService} from './session-store.service.js';
import { OidcProvider } from './oidc-provider.js';

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
  browserBinding?:string;
}

@Injectable()
export class OidcService {
  private readonly logger = new Logger(OidcService.name);
  private readonly provider:OidcProvider;
  async logoutUrl():Promise<string|undefined> {
    if(this.config.mockOidcEnabled || !this.config.oidcPostLogoutRedirectUri)return undefined;
    try {const metadata=await this.provider.metadata();if(!metadata.end_session_endpoint)return undefined;
      const url=new URL(metadata.end_session_endpoint);url.searchParams.set('post_logout_redirect_uri',this.config.oidcPostLogoutRedirectUri);url.searchParams.set('client_id',this.config.oidcClientId);return url.href;
    }catch{return undefined;} // Local session revocation must succeed during provider outage.
  }

  constructor(private readonly config:BffConfigService,private readonly sessions:SessionStoreService){this.provider=new OidcProvider(config);}

  /**
   * Generates PKCE verifier/challenge, state, and nonce, then constructs the OIDC authorization URL.
   */
  public async createProviderAuthorizationRequest(returnUrl?:string,browserBinding?:string):Promise<AuthorizationRequest> {
    if(this.config.mockOidcEnabled)return this.createAuthorizationRequest(returnUrl);
    if(!browserBinding || browserBinding.length<32)throw new OidcCallbackException('Browser login binding required.');
    const metadata=await this.provider.metadata();
    return this.buildAuthorizationRequest(metadata.authorization_endpoint,returnUrl,browserBinding);
  }
  public async createAuthorizationRequest(returnUrl?: string): Promise<AuthorizationRequest> {
    if(!this.config.mockOidcEnabled)throw new OidcCallbackException('Real login requires trusted discovery.');
    return this.buildAuthorizationRequest(`${this.config.oidcIssuerUrl}/protocol/openid-connect/auth`,returnUrl);
  }
  private async buildAuthorizationRequest(endpoint:string,returnUrl?:string,browserBinding?:string):Promise<AuthorizationRequest> {
    const state = crypto.randomBytes(32).toString('hex');
    const nonce = crypto.randomBytes(32).toString('hex');
    const codeVerifier = crypto.randomBytes(32).toString('base64url');

    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');

    await this.sessions.putLogin(state, {
      issuer:this.config.oidcIssuerUrl,clientId:this.config.oidcClientId,redirectUri:this.config.oidcRedirectUri,
      state,
      nonce,
      codeVerifier,
      returnUrl,
      createdAtMs: Date.now(),
      browserBinding:browserBinding?crypto.createHash('sha256').update(browserBinding).digest('hex'):undefined,
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

    const url=new URL(endpoint);for(const [key,value] of params)url.searchParams.set(key,value);
    const authorizationUrl=url.href;

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
    browserBinding?: string,
  ): Promise<{ tokens: ValidatedOidcTokens; returnUrl?: string }> {
    if (error) {
      throw new OidcCallbackException(
        'OIDC Provider returned an authentication error.',
      );
    }

    if (!state) {
      throw new OidcCallbackException('Missing state parameter in callback request.');
    }

    const pending = await this.sessions.consumeLogin(state);
    if (!pending) {
      throw new OidcCallbackException('Invalid, replayed, or expired OIDC state parameter.');
    }
    // Delete state immediately to prevent replay attacks
    if(pending.issuer!==this.config.oidcIssuerUrl||pending.clientId!==this.config.oidcClientId||pending.redirectUri!==this.config.oidcRedirectUri)throw new OidcCallbackException('OIDC transaction configuration changed; restart login.');
    if(pending.browserBinding && (!browserBinding || crypto.createHash('sha256').update(browserBinding).digest('hex')!==pending.browserBinding))throw new OidcCallbackException('Browser login binding mismatch.');
    if (Date.now() - pending.createdAtMs > 10 * 60 * 1000) {
      throw new OidcCallbackException('Invalid, replayed, or expired OIDC state parameter.');
    }

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
    const tokenResponse=await this.provider.exchange(code,pending.codeVerifier);
    const user=await this.provider.verify(tokenResponse.id_token,pending.nonce);
    return {tokens:{user,idToken:tokenResponse.id_token,accessToken:tokenResponse.access_token,refreshToken:tokenResponse.refresh_token},returnUrl:pending.returnUrl};
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
    if(!this.config.mockOidcEnabled)throw new OidcCallbackException('Synthetic token verification is unavailable for real login.');
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
    if (Array.isArray(aud) && aud.length > 1 && payload['azp'] !== expectedAudience) {
      throw new OidcCallbackException('ID token authorized party mismatch.');
    }

    // Nonce validation
    const nonce = String(payload['nonce'] ?? '');
    if (!nonce || nonce !== expectedNonce) {
      throw new OidcCallbackException('ID token nonce mismatch or missing.');
    }

    // Expiration validation
    const exp = Number(payload['exp']);
    const nowSec = Math.floor(Date.now() / 1000);
    if (typeof payload['exp'] !== 'number' || !Number.isFinite(exp) || nowSec > exp + 10) {
      throw new OidcCallbackException('ID token has expired.');
    }
    if (payload['nbf'] !== undefined && (typeof payload['nbf'] !== 'number' || !Number.isFinite(payload['nbf']) || payload['nbf'] > nowSec + 10)) {
      throw new OidcCallbackException('ID token is not yet valid.');
    }

    const sub = String(payload['sub'] ?? '');
    if (typeof payload['sub'] !== 'string' || !sub) {
      throw new OidcCallbackException('Missing subject claim (sub) in ID token.');
    }

    // Claims alone are not authentication. Only the configured symmetric provider
    // algorithm is supported here; asymmetric/unsigned tokens fail closed.
    let header: { alg?: string };
    try { header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8')); }
    catch { throw new OidcCallbackException('Invalid ID token header.'); }
    if (!this.config.mockOidcEnabled && this.config.oidcClientSecret.length < 32) {
      throw new OidcCallbackException('A strong configured OIDC verification secret is required.');
    }
    const expected = crypto.createHmac('sha256', this.config.oidcClientSecret).update(`${headerB64}.${payloadB64}`).digest();
    const signature = Buffer.from(parts[2]!, 'base64url');
    if (header.alg !== 'HS256' || signature.length !== expected.length || !crypto.timingSafeEqual(expected, signature)) {
      throw new OidcCallbackException('Invalid ID token signature or unsupported algorithm.');
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
