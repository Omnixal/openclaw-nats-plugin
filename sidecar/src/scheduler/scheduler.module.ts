import { Module } from '@onebun/core';
import { PublisherModule } from '../publisher/publisher.module';
import { LogModule } from '../logs/log.module';
import { SchedulerRepository } from './scheduler.repository';
import { SchedulerService } from './scheduler.service';
import { SchedulerController } from './scheduler.controller';

@Module({
  imports: [PublisherModule, LogModule],
  controllers: [SchedulerController],
  providers: [SchedulerRepository, SchedulerService],
  exports: [SchedulerService],
})
export class SchedulerModule {}
