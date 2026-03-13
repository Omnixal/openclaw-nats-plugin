import { Service, BaseService } from '@onebun/core';
import type { NatsEventEnvelope } from '../publisher/envelope';
import type { PreHandler, PipelineContext } from './pre-handler.interface';

@Service()
export class PriorityHandler extends BaseService implements PreHandler {
  name = 'priority';

  async handle(msg: NatsEventEnvelope, ctx: PipelineContext): Promise<'pass' | 'drop'> {
    const raw = msg.meta?.priority ?? 5;
    ctx.enrichments['priority'] = Math.max(1, Math.min(10, raw));
    return 'pass';
  }
}
