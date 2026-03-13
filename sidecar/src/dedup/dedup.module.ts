import { Module } from '@onebun/core';
import { DedupService } from './dedup.service';
import { DedupRepository } from './dedup.repository';

@Module({
  providers: [DedupService, DedupRepository],
  exports: [DedupService],
})
export class DedupModule {}
