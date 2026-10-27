import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from '@nestjs/common';
import fastifyCookie from '@fastify/cookie';
import { AppModule } from './app.module.js';
import { BffConfigService } from './config/bff-config.service.js';
import { ProblemDetailsFilter } from './common/filters/problem-details.filter.js';

async function bootstrap() {
  const logger = new Logger('ConsoleBffBootstrap');

  const fastifyAdapter = new FastifyAdapter({
    bodyLimit: 5 * 1024 * 1024, // 5 MiB max body size
    logger: false,
  });

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    fastifyAdapter,
  );

  const config = app.get(BffConfigService);

  // Register cookie parser
  await app.register(fastifyCookie as any, {
    secret: config.sessionSecret,
  });

  // Global RFC 7807 Problem Details filter
  app.useGlobalFilters(new ProblemDetailsFilter());

  // Graceful shutdown hooks
  app.enableShutdownHooks();

  // CORS with credentials support for Angular Console Web
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const isAllowed = config.allowedOrigins.includes(origin) || config.allowedOrigins.includes('*');
      if (isAllowed) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS policy'), false);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'X-CSRF-Token',
      'X-XSRF-Token',
      'X-Correlation-ID',
      'X-Request-ID',
    ],
    exposedHeaders: ['X-Correlation-ID', 'X-Request-ID'],
  });

  // Security headers & cache control hook
  const fastifyInstance = app.getHttpAdapter().getInstance();
  fastifyInstance.addHook('onSend', (request, reply, payload, done) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    reply.header(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self';",
    );

    // Ensure session and auth endpoints are never cached by intermediaries
    if (request.url.startsWith('/bff/auth') || request.url.startsWith('/bff/session')) {
      reply.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      reply.header('Pragma', 'no-cache');
      reply.header('Expires', '0');
    }

    done();
  });

  await app.init();
  await app.listen(config.port, config.host);

  logger.log(
    `Skyra LogHub Console BFF listening on http://${config.host}:${config.port} [env=${config.nodeEnv}, cookie=${config.sessionCookieName}, queryService=${config.queryServiceUrl}]`,
  );
}

void bootstrap();
