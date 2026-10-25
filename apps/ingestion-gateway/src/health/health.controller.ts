import { Controller, Get, Res, HttpStatus } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { HealthService } from './health.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('live')
  public live() {
    return this.healthService.getLiveness();
  }

  @Get('ready')
  public async ready(@Res() res: FastifyReply) {
    const readiness = await this.healthService.getReadiness();
    const status = readiness.status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE;
    return res.status(status).send(readiness);
  }
}
