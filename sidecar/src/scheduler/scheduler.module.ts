import { Module } from '@onebun/core';
import { SchedulerRepository } from './scheduler.repository';
import { SchedulerService } from './scheduler.service';
import { SchedulerController } from './scheduler.controller';

@Module({
  controllers: [SchedulerController],
  providers: [SchedulerRepository, SchedulerService],
  exports: [SchedulerService],
})
export class SchedulerModule {}
