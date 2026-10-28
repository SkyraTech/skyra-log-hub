import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module.js';
import { AdminConfigService } from './core/config/admin-config.service.js';
import { Rfc7807ExceptionFilter } from './api/filters/rfc7807-exception.filter.js';

async function bootstrap() {
  const logger = new Logger('AdminServiceBootstrap');

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: false,
      bodyLimit: 1048576, // 1MB payload budget
    }),
  );

  const config = app.get(AdminConfigService);

  app.useGlobalFilters(new Rfc7807ExceptionFilter());

  // Graceful shutdown hooks
  app.enableShutdownHooks();

  await app.listen(config.port, '0.0.0.0');
  logger.log(`Skyra Administration Backend active on http://0.0.0.0:${config.port} (Env: ${config.nodeEnv}, Gate A mode)`);
}

bootstrap().catch((err: unknown) => {
  const msg = err instanceof Error ? err.stack ?? err.message : String(err);
  console.error('Fatal administration service startup error:', msg);
  process.exit(1);
});
