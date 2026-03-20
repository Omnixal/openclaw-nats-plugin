import { Module } from '@onebun/core';
import { PublisherService } from './publisher.service';
import { PublisherController } from './publisher.controller';
import { MetricsModule } from '../metrics/metrics.module';

@Module({
  imports: [MetricsModule],
  controllers: [PublisherController],
  providers: [PublisherService],
  exports: [PublisherService],
})
export class PublisherModule {}
