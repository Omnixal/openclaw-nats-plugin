import { Module } from '@onebun/core';
import { PendingController } from './pending.controller';
import { PendingService } from './pending.service';
import { PendingRepository } from './pending.repository';
import { PendingFlushService } from './pending-flush.service';
import { MetricsModule } from '../metrics/metrics.module';
import { LogModule } from '../logs/log.module';

@Module({
  imports: [MetricsModule, LogModule],
  controllers: [PendingController],
  providers: [PendingService, PendingRepository, PendingFlushService],
  exports: [PendingService],
})
export class PendingModule {}
