import { Module } from '@onebun/core';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { GatewayClientModule } from '../gateway/gateway-client.module';
import { PendingModule } from '../pending/pending.module';

@Module({
  imports: [GatewayClientModule, PendingModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
