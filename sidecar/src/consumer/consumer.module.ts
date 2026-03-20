import { Module } from '@onebun/core';
import { ConsumerController } from './consumer.controller';
import { PreHandlersModule } from '../pre-handlers/pre-handlers.module';
import { PendingModule } from '../pending/pending.module';
import { RouterModule } from '../router/router.module';
import { MetricsModule } from '../metrics/metrics.module';

@Module({
  imports: [PreHandlersModule, PendingModule, RouterModule, MetricsModule],
  controllers: [ConsumerController],
})
export class ConsumerModule {}
