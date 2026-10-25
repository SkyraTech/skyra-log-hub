import { Global, Module } from '@nestjs/common';
import { GatewayConfigService } from './config.service.js';

@Global()
@Module({
  providers: [GatewayConfigService],
  exports: [GatewayConfigService],
})
export class GatewayConfigModule {}

export { GatewayConfigModule as ConfigModule };
