import { Module } from '@onebun/core';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { NatsStreamsModule } from '../nats-streams/nats-streams.module';
import { GatewayClientModule } from '../gateway/gateway-client.module';
import { PendingModule } from '../pending/pending.module';

@Module({
  imports: [NatsStreamsModule, GatewayClientModule, PendingModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
