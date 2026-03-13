import { Module } from '@onebun/core';
import { GatewayClientService } from './gateway-client.service';

@Module({
  providers: [GatewayClientService],
  exports: [GatewayClientService],
})
export class GatewayClientModule {}
