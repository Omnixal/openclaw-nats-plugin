import { Module } from '@onebun/core';
import { PendingController } from './pending.controller';
import { PendingService } from './pending.service';
import { PendingRepository } from './pending.repository';

@Module({
  controllers: [PendingController],
  providers: [PendingService, PendingRepository],
  exports: [PendingService],
})
export class PendingModule {}
