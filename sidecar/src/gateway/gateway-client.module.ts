import { Global, Module } from '@onebun/core';
import { GatewayClientService } from './gateway-client.service';

@Global()
@Module({
  providers: [GatewayClientService],
  exports: [GatewayClientService],
})
export class GatewayClientModule {}
