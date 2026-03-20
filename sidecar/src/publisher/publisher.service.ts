import { Service, BaseService, QueueService } from '@onebun/core';
import { createEnvelope, type EnvelopeMeta } from './envelope';
import { MetricsService } from '../metrics/metrics.service';

@Service()
export class PublisherService extends BaseService {
  constructor(
    private queueService: QueueService,
    private metrics: MetricsService,
  ) {
    super();
  }

  async publish(subject: string, payload: unknown, meta?: EnvelopeMeta): Promise<void> {
    const envelope = createEnvelope(subject, payload, meta);
    await this.queueService.publish(subject, envelope);
    this.metrics.recordPublish(subject);
    this.logger.debug(`Published to ${subject}`, { id: envelope.id });
  }
}
