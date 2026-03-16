import { Module } from '@onebun/core';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { PendingModule } from '../pending/pending.module';

@Module({
  imports: [PendingModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
