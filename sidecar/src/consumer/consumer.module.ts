import { Module } from '@onebun/core';
import { ConsumerController } from './consumer.controller';
import { PreHandlersModule } from '../pre-handlers/pre-handlers.module';
import { GatewayClientModule } from '../gateway/gateway-client.module';
import { PendingModule } from '../pending/pending.module';

@Module({
  imports: [PreHandlersModule, GatewayClientModule, PendingModule],
  controllers: [ConsumerController],
})
export class ConsumerModule {}
