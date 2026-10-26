import { Module } from '@nestjs/common';
import { SearchController } from './search.controller.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule],
  controllers: [SearchController],
})
export class SearchModule {}
