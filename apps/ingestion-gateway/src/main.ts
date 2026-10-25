import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from '@nestjs/common';
import { parseStrictJson } from '@skyra/logger-core';
import { AppModule } from './app.module.js';
import { ConfigService } from './config/config.service.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';

async function bootstrap() {
  const logger = new Logger('GatewayBootstrap');

  const fastifyAdapter = new FastifyAdapter({
    bodyLimit: 5 * 1024 * 1024, // 5 MiB
    logger: false,
  });

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    fastifyAdapter,
  );

  const config = app.get(ConfigService);

  // Global filters
  app.useGlobalFilters(new HttpExceptionFilter());

  // Graceful shutdown hooks
  app.enableShutdownHooks();

  // CORS
  if (config.corsOrigins.length > 0 && !config.corsOrigins.includes('*')) {
    app.enableCors({
      origin: [...config.corsOrigins],
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    });
  }

  await app.init();

  // Fastify strict JSON parser to detect duplicate keys at all depths
  const fastifyInstance = app.getHttpAdapter().getInstance();
  fastifyInstance.removeContentTypeParser('application/json');
  fastifyInstance.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_req: any, body: string, done: any) => {
      try {
        if (!body || body.trim() === '') {
          done(null, {});
          return;
        }
        const parsed = parseStrictJson(body);
        done(null, parsed);
      } catch (err) {
        done(err);
      }
    },
  );
  await app.listen(config.port, config.host);
  logger.log(`Skyra Ingestion Gateway listening on http://${config.host}:${config.port} [env=${config.nodeEnv}]`);
}

void bootstrap();
