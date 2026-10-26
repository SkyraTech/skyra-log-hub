import { Module, Global } from '@nestjs/common';
import { QueryConfigService } from './query-config.service.js';

@Global()
@Module({
  providers: [
    {
      provide: 'CONFIG_OVERRIDE',
      useValue: undefined,
    },
    QueryConfigService,
  ],
  exports: [QueryConfigService],
})
export class ConfigModule {}
