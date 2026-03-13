import { Module } from '@onebun/core';
import { NatsAdapterService } from './nats-adapter.service';

@Module({
  providers: [NatsAdapterService],
  exports: [NatsAdapterService],
})
export class NatsStreamsModule {}
