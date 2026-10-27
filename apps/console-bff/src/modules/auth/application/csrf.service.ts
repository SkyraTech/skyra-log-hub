import * as crypto from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { BffConfigService } from '../../../config/bff-config.service.js';
import { CsrfValidationException } from '../../../common/errors/bff.errors.js';

@Injectable()
export class CsrfService {
  constructor(private readonly config: BffConfigService) {}

  public generateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  public validateToken(providedToken?: string, sessionToken?: string): boolean {
    if (!providedToken || !sessionToken) {
      return false;
    }

    const providedBuf = Buffer.from(providedToken, 'utf-8');
    const sessionBuf = Buffer.from(sessionToken, 'utf-8');

    if (providedBuf.length !== sessionBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(providedBuf, sessionBuf);
  }

  public validateOrigin(originHeader?: string, refererHeader?: string): void {
    const originToCheck = originHeader || (refererHeader ? new URL(refererHeader).origin : undefined);

    if (!originToCheck) {
      throw new CsrfValidationException('Missing required Origin or Referer header on state-changing request.');
    }

    const allowed = this.config.allowedOrigins;
    const isAllowed = allowed.includes(originToCheck) || allowed.includes('*');

    if (!isAllowed) {
      throw new CsrfValidationException(`Origin "${originToCheck}" is not in the allowed origins allowlist.`);
    }
  }
}
