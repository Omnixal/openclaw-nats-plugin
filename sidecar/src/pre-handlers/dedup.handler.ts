import { Service, BaseService } from '@onebun/core';
import { DedupService } from '../dedup/dedup.service';
import type { NatsEventEnvelope } from '../publisher/envelope';
import type { PreHandler, PipelineContext } from './pre-handler.interface';

@Service()
export class DedupHandler extends BaseService implements PreHandler {
  name = 'dedup';

  constructor(private dedupService: DedupService) {
    super();
  }

  async handle(msg: NatsEventEnvelope, _ctx: PipelineContext): Promise<'pass' | 'drop'> {
    const isDup = await this.dedupService.isDuplicate(msg.id, msg.subject);
    if (isDup) {
      this.logger.debug(`Dropping duplicate event ${msg.id}`);
      return 'drop';
    }
    return 'pass';
  }
}
