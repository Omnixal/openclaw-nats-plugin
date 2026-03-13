import { Module } from '@onebun/core';
import { DedupModule } from '../dedup/dedup.module';
import { PipelineService } from './pipeline.service';
import { DedupHandler } from './dedup.handler';
import { FilterHandler } from './filter.handler';
import { EnrichHandler } from './enrich.handler';
import { PriorityHandler } from './priority.handler';

@Module({
  imports: [DedupModule],
  providers: [PipelineService, DedupHandler, FilterHandler, EnrichHandler, PriorityHandler],
  exports: [PipelineService],
})
export class PreHandlersModule {}
