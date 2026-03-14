import { Service, BaseService, QueueService } from '@onebun/core';
import { createEnvelope, type EnvelopeMeta } from './envelope';

@Service()
export class PublisherService extends BaseService {
  constructor(private queueService: QueueService) {
    super();
  }

  async publish(subject: string, payload: unknown, meta?: EnvelopeMeta): Promise<void> {
    const envelope = createEnvelope(subject, payload, meta);
    await this.queueService.publish(subject, envelope);
    this.logger.debug(`Published to ${subject}`, { id: envelope.id });
  }
}
