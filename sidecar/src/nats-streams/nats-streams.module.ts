import { Module } from '@onebun/core';
import { StreamSetupController } from './stream-setup.controller';

@Module({
  controllers: [StreamSetupController],
})
export class NatsStreamsModule {}
