import { Service, BaseService } from '@onebun/core';
import { NatsAdapterService } from '../nats-streams/nats-adapter.service';
import { createEnvelope, type EnvelopeMeta } from './envelope';

@Service()
export class PublisherService extends BaseService {
  constructor(private natsAdapter: NatsAdapterService) {
    super();
  }

  async publish(subject: string, payload: unknown, meta?: EnvelopeMeta): Promise<void> {
    if (!this.natsAdapter.isConnected()) {
      this.logger.warn(`NATS not connected, dropping publish to ${subject}`);
      return;
    }
    const envelope = createEnvelope(subject, payload, meta);
    await this.natsAdapter.publish(subject, envelope);
    this.logger.debug(`Published to ${subject}`, { id: envelope.id });
  }
}
