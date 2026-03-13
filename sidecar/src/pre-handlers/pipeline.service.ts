import { Service, BaseService } from '@onebun/core';
import type { NatsEventEnvelope } from '../publisher/envelope';
import type { PreHandler, PipelineContext } from './pre-handler.interface';
import { DedupHandler } from './dedup.handler';
import { FilterHandler } from './filter.handler';
import { EnrichHandler } from './enrich.handler';
import { PriorityHandler } from './priority.handler';

@Service()
export class PipelineService extends BaseService {
  constructor(
    private dedupHandler: DedupHandler,
    private filterHandler: FilterHandler,
    private enrichHandler: EnrichHandler,
    private priorityHandler: PriorityHandler,
  ) {
    super();
  }

  async process(envelope: NatsEventEnvelope): Promise<{ result: 'pass' | 'drop'; ctx: PipelineContext }> {
    const ctx: PipelineContext = { enrichments: {} };
    const handlers: PreHandler[] = [
      this.dedupHandler,
      this.filterHandler,
      this.enrichHandler,
      this.priorityHandler,
    ];

    for (const handler of handlers) {
      const result = await handler.handle(envelope, ctx);
      if (result === 'drop') {
        this.logger.debug(`Pipeline dropped by ${handler.name}`, { id: envelope.id });
        return { result: 'drop', ctx };
      }
    }
    return { result: 'pass', ctx };
  }
}
