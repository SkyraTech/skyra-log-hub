import { Module } from '@nestjs/common';
import { AuthModule } from './modules/auth/auth.module.js';
import { QueryProxyModule } from './modules/query-proxy/query-proxy.module.js';
import { BffConfigService } from './config/bff-config.service.js';

@Module({
  imports: [AuthModule, QueryProxyModule],
  providers: [BffConfigService],
  exports: [BffConfigService],
})
export class AppModule {}
