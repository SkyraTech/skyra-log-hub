import { Module } from '@nestjs/common';
import { ProjectService } from './project.service.js';

@Module({
  providers: [ProjectService],
  exports: [ProjectService],
})
export class ProjectModule {}
