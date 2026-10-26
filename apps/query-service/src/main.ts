import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module.js';
import { QueryConfigService } from './config/query-config.service.js';
import { ProblemDetailsFilter } from './common/filters/problem-details.filter.js';

async function bootstrap() {
  const logger = new Logger('QueryServiceBootstrap');

  const fastifyAdapter = new FastifyAdapter({
    bodyLimit: 2 * 1024 * 1024, // 2 MiB
    logger: false,
  });

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    fastifyAdapter,
  );

  const config = app.get(QueryConfigService);

  // Global RFC 7807 Problem Details filter
  app.useGlobalFilters(new ProblemDetailsFilter());

  // Graceful shutdown hooks
  app.enableShutdownHooks();

  // CORS configuration
  if (config.corsOrigins.length > 0) {
    app.enableCors({
      origin: config.corsOrigins.includes('*') ? '*' : [...config.corsOrigins],
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-ID', 'X-Request-ID'],
    });
  }

  await app.init();

  await app.listen(config.port, config.host);
  logger.log(
    `Skyra Query Service listening on http://${config.host}:${config.port} [env=${config.nodeEnv}, authMode=${config.authMode}, archiveRoot=${config.archiveRoot}]`,
  );
}

void bootstrap();
