import { Module } from '@onebun/core';
import { RouteFilterService } from './route-filter.service';

@Module({
  services: [RouteFilterService],
  exports: [RouteFilterService],
})
export class RouteFilterModule {}
