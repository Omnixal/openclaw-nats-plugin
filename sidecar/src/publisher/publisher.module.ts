import { Module } from '@onebun/core';
import { PublisherService } from './publisher.service';
import { PublisherController } from './publisher.controller';
import { NatsStreamsModule } from '../nats-streams/nats-streams.module';

@Module({
  imports: [NatsStreamsModule],
  controllers: [PublisherController],
  providers: [PublisherService],
  exports: [PublisherService],
})
export class PublisherModule {}
