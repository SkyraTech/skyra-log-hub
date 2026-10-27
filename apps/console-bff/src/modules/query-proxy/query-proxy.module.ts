import { Module } from '@nestjs/common';
import { QueryProxyController } from './api/query-proxy.controller.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule],
  controllers: [QueryProxyController],
})
export class QueryProxyModule {}
