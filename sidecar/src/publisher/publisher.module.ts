import { Module } from '@onebun/core';
import { PublisherService } from './publisher.service';
import { PublisherController } from './publisher.controller';

@Module({
  controllers: [PublisherController],
  providers: [PublisherService],
  exports: [PublisherService],
})
export class PublisherModule {}
