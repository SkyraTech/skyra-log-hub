import { Module, Global } from '@nestjs/common';
import { DiagnosticsService } from './diagnostics.service.js';

@Global()
@Module({
  providers: [DiagnosticsService],
  exports: [DiagnosticsService],
})
export class ObservabilityModule {}
