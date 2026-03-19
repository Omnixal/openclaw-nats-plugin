import { Module } from '@onebun/core';
import { RouterRepository } from './router.repository';
import { RouterService } from './router.service';
import { RouterController } from './router.controller';

@Module({
  controllers: [RouterController],
  providers: [RouterRepository, RouterService],
  exports: [RouterService],
})
export class RouterModule {}
