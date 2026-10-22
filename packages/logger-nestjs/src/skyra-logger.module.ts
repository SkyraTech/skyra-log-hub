import {
  Module,
  DynamicModule,
  Global,
  Provider,
  NestModule,
  MiddlewareConsumer,
  Inject,
  Optional,
} from '@nestjs/common';
import { APP_INTERCEPTOR, APP_FILTER } from '@nestjs/core';
import { createSkyraLogger } from '@skyra/logger-node';
import type { SkyraLogger } from '@skyra/logger-node';
import {
  SkyraLoggerOptions,
  SkyraLoggerModuleAsyncOptions,
  SkyraLoggerOptionsFactory,
} from './skyra-logger.options.js';
import { SKYRA_LOGGER_OPTIONS, SKYRA_LOGGER_INSTANCE } from './constants.js';
import { SkyraLoggerService } from './skyra-logger.service.js';
import { RequestContextService } from './context/request-context.service.js';
import { SkyraCorrelationMiddleware } from './middleware/correlation.middleware.js';
import { SkyraHttpLoggingInterceptor } from './interceptors/http-logging.interceptor.js';
import { SkyraHttpExceptionFilter } from './filters/http-exception.filter.js';

@Global()
@Module({})
export class SkyraLoggerModule implements NestModule {
  constructor(
    @Optional() @Inject(SKYRA_LOGGER_OPTIONS) private readonly options?: SkyraLoggerOptions
  ) {}

  /**
   * Synchronous module registration with static options.
   */
  public static forRoot(options: SkyraLoggerOptions): DynamicModule {
    const providers = this.createProviders(options);

    return {
      module: SkyraLoggerModule,
      global: true,
      providers,
      exports: [
        SkyraLoggerService,
        RequestContextService,
        SkyraCorrelationMiddleware,
        SkyraHttpLoggingInterceptor,
        SkyraHttpExceptionFilter,
        SKYRA_LOGGER_INSTANCE,
        SKYRA_LOGGER_OPTIONS,
      ],
    };
  }

  /**
   * Asynchronous module registration with factory/service options.
   */
  public static forRootAsync(asyncOptions: SkyraLoggerModuleAsyncOptions): DynamicModule {
    const asyncProviders = this.createAsyncProviders(asyncOptions);

    const loggerInstanceProvider: Provider = {
      provide: SKYRA_LOGGER_INSTANCE,
      useFactory: (options: SkyraLoggerOptions): SkyraLogger => {
        return createSkyraLogger(options);
      },
      inject: [SKYRA_LOGGER_OPTIONS],
    };

    const commonProviders: Provider[] = [
      ...asyncProviders,
      loggerInstanceProvider,
      RequestContextService,
      SkyraLoggerService,
      SkyraCorrelationMiddleware,
      SkyraHttpLoggingInterceptor,
      SkyraHttpExceptionFilter,
      {
        provide: APP_INTERCEPTOR,
        useClass: SkyraHttpLoggingInterceptor,
      },
      {
        provide: APP_FILTER,
        useClass: SkyraHttpExceptionFilter,
      },
    ];

    return {
      module: SkyraLoggerModule,
      global: asyncOptions.isGlobal ?? true,
      imports: asyncOptions.imports ?? [],
      providers: commonProviders,
      exports: [
        SkyraLoggerService,
        RequestContextService,
        SkyraCorrelationMiddleware,
        SkyraHttpLoggingInterceptor,
        SkyraHttpExceptionFilter,
        SKYRA_LOGGER_INSTANCE,
        SKYRA_LOGGER_OPTIONS,
      ],
    };
  }

  public configure(consumer: MiddlewareConsumer): void {
    // If HTTP logging is explicitly disabled, do not mount correlation middleware
    if (this.options?.http?.enabled === false) {
      return;
    }
    // Automatically apply correlation middleware across all routes
    consumer.apply(SkyraCorrelationMiddleware).forRoutes('*');
  }

  private static createProviders(options: SkyraLoggerOptions): Provider[] {
    const autoRegister =
      options.http?.enabled !== false && options.http?.autoRegisterGlobalInterceptors !== false;

    const providers: Provider[] = [
      {
        provide: SKYRA_LOGGER_OPTIONS,
        useValue: options,
      },
      {
        provide: SKYRA_LOGGER_INSTANCE,
        useFactory: (): SkyraLogger => createSkyraLogger(options),
      },
      RequestContextService,
      SkyraLoggerService,
      SkyraCorrelationMiddleware,
      SkyraHttpLoggingInterceptor,
      SkyraHttpExceptionFilter,
    ];

    if (autoRegister) {
      providers.push(
        {
          provide: APP_INTERCEPTOR,
          useClass: SkyraHttpLoggingInterceptor,
        },
        {
          provide: APP_FILTER,
          useClass: SkyraHttpExceptionFilter,
        }
      );
    }

    return providers;
  }

  private static createAsyncProviders(options: SkyraLoggerModuleAsyncOptions): Provider[] {
    if (options.useFactory) {
      return [
        {
          provide: SKYRA_LOGGER_OPTIONS,
          useFactory: options.useFactory,
          inject: options.inject ?? [],
        },
      ];
    }

    if (options.useClass) {
      return [
        {
          provide: options.useClass,
          useClass: options.useClass,
        },
        {
          provide: SKYRA_LOGGER_OPTIONS,
          useFactory: async (factory: SkyraLoggerOptionsFactory) =>
            factory.createSkyraLoggerOptions(),
          inject: [options.useClass],
        },
      ];
    }

    if (options.useExisting) {
      return [
        {
          provide: SKYRA_LOGGER_OPTIONS,
          useFactory: async (factory: SkyraLoggerOptionsFactory) =>
            factory.createSkyraLoggerOptions(),
          inject: [options.useExisting],
        },
      ];
    }

    throw new Error('Invalid SkyraLoggerModuleAsyncOptions: must supply useFactory, useClass, or useExisting');
  }
}
