import { Module } from '@onebun/core';
import { ConsumerService } from './consumer.service';
import { NatsStreamsModule } from '../nats-streams/nats-streams.module';
import { PreHandlersModule } from '../pre-handlers/pre-handlers.module';
import { GatewayClientModule } from '../gateway/gateway-client.module';
import { PendingModule } from '../pending/pending.module';

@Module({
  imports: [NatsStreamsModule, PreHandlersModule, GatewayClientModule, PendingModule],
  providers: [ConsumerService],
})
export class ConsumerModule {}
