import {DashboardProxyController} from './api/dashboard.controller.js';
import {ExportController} from './api/export.controller.js';
import { Module } from '@nestjs/common';
import { QueryProxyController } from './api/query-proxy.controller.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule],
  controllers: [QueryProxyController, ExportController,DashboardProxyController],
})
export class QueryProxyModule {}
