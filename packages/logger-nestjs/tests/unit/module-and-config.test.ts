import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { Test } from '@nestjs/testing';
import { SkyraLoggerModule } from '../../dist/skyra-logger.module.js';
import { SkyraLoggerService } from '../../dist/skyra-logger.service.js';
import { RequestContextService } from '../../dist/context/request-context.service.js';
import { SKYRA_LOGGER_OPTIONS, SKYRA_LOGGER_INSTANCE } from '../../dist/constants.js';
import type {
  SkyraLoggerOptions,
  SkyraLoggerOptionsFactory,
} from '../../dist/skyra-logger.options.js';

class ConfigTestService implements SkyraLoggerOptionsFactory {
  createSkyraLoggerOptions(): SkyraLoggerOptions {
    return {
      projectId: 'skyra-erp',
      serviceName: 'erp-api',
      environment: 'test',
      instanceId: 'inst-class-01',
      level: 'info',
      transport: { type: 'stdout' },
    };
  }
}

describe('SkyraLoggerModule (Unit)', () => {
  it('1. registers synchronously with forRoot()', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        SkyraLoggerModule.forRoot({
          projectId: 'skyra-erp',
          serviceName: 'erp-api',
          environment: 'test',
          instanceId: 'inst-01',
          level: 'info',
          transport: { type: 'stdout' },
          http: {
            enabled: true,
            excludePaths: ['/health'],
          },
        }),
      ],
    }).compile();

    const service = moduleRef.get(SkyraLoggerService);
    const contextService = moduleRef.get(RequestContextService);
    const options = moduleRef.get(SKYRA_LOGGER_OPTIONS);
    const loggerInstance = moduleRef.get(SKYRA_LOGGER_INSTANCE);

    assert.ok(service instanceof SkyraLoggerService);
    assert.ok(contextService instanceof RequestContextService);
    assert.equal(options.projectId, 'skyra-erp');
    assert.ok(loggerInstance);

    await service.close();
  });

  it('2. registers asynchronously with forRootAsync() using useFactory', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        SkyraLoggerModule.forRootAsync({
          useFactory: async () => ({
            projectId: 'skyra-crm',
            serviceName: 'crm-api',
            environment: 'staging',
            instanceId: 'inst-async-01',
            level: 'debug',
            transport: { type: 'stdout' },
          }),
        }),
      ],
    }).compile();

    const service = moduleRef.get(SkyraLoggerService);
    const options = moduleRef.get(SKYRA_LOGGER_OPTIONS);

    assert.ok(service);
    assert.equal(options.projectId, 'skyra-crm');
    assert.equal(options.serviceName, 'crm-api');

    await service.close();
  });

  it('3. registers asynchronously with forRootAsync() using useClass', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        SkyraLoggerModule.forRootAsync({
          useClass: ConfigTestService,
        }),
      ],
    }).compile();

    const service = moduleRef.get(SkyraLoggerService);
    const options = moduleRef.get(SKYRA_LOGGER_OPTIONS);

    assert.ok(service);
    assert.equal(options.projectId, 'skyra-erp');
    assert.equal(options.instanceId, 'inst-class-01');

    await service.close();
  });

  it('4. throws when async registration lacks required provider config', () => {
    assert.throws(
      () => {
        SkyraLoggerModule.forRootAsync({} as any);
      },
      /Invalid SkyraLoggerModuleAsyncOptions/
    );
  });
});
