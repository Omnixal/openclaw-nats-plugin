import { Module } from '@onebun/core';
import { ConsumerController } from './consumer.controller';
import { PreHandlersModule } from '../pre-handlers/pre-handlers.module';
import { PendingModule } from '../pending/pending.module';

@Module({
  imports: [PreHandlersModule, PendingModule],
  controllers: [ConsumerController],
})
export class ConsumerModule {}
