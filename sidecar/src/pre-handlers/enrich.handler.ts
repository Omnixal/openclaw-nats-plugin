import { Service, BaseService } from '@onebun/core';
import type { NatsEventEnvelope } from '../publisher/envelope';
import type { PreHandler, PipelineContext } from './pre-handler.interface';

@Service()
export class EnrichHandler extends BaseService implements PreHandler {
  name = 'enrich';

  async handle(msg: NatsEventEnvelope, ctx: PipelineContext): Promise<'pass' | 'drop'> {
    ctx.enrichments['processedAt'] = new Date().toISOString();
    ctx.enrichments['source'] = msg.source;
    return 'pass';
  }
}
