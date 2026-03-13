import { Service, BaseService, type OnModuleInit, type OnModuleDestroy } from '@onebun/core';
import type { Message, Subscription } from '@onebun/core';
import { NatsAdapterService } from '../nats-streams/nats-adapter.service';
import { PipelineService } from '../pre-handlers/pipeline.service';
import { GatewayClientService } from '../gateway/gateway-client.service';
import { PendingService } from '../pending/pending.service';
import type { NatsEventEnvelope } from '../publisher/envelope';

@Service()
export class ConsumerService extends BaseService implements OnModuleInit, OnModuleDestroy {
  private subscription: Subscription | null = null;

  constructor(
    private natsAdapter: NatsAdapterService,
    private pipeline: PipelineService,
    private gatewayClient: GatewayClientService,
    private pendingService: PendingService,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    if (!this.natsAdapter.isConnected()) {
      this.logger.warn('NATS not connected, consumer will not start');
      return;
    }

    try {
      const consumerName = this.config.get('consumer.name');
      this.subscription = await this.natsAdapter.subscribe(
        'agent.inbound.>',
        (message: Message<unknown>) => this.handleInbound(message),
        { ackMode: 'manual', group: consumerName },
      );
      this.logger.info(`Consuming from agent_inbound as ${consumerName}`);
    } catch (err: any) {
      this.logger.warn(`Failed to start consumer: ${err?.message}`);
    }
  }

  private async handleInbound(message: Message<unknown>): Promise<void> {
    try {
      const envelope = this.extractEnvelope(message);

      const { result, ctx } = await this.pipeline.process(envelope);

      if (result === 'drop') {
        await message.ack();
        return;
      }

      // Deliver to Gateway
      if (this.gatewayClient.isAlive()) {
        await this.gatewayClient.inject({
          target: envelope.agentTarget ?? 'main',
          message: this.formatMessage(envelope),
          metadata: {
            source: 'nats',
            eventId: envelope.id,
            subject: envelope.subject,
            priority: (ctx.enrichments['priority'] as number) ?? envelope.meta?.priority ?? 5,
          },
        });
        await message.ack();
      } else {
        // Gateway not available — store as pending for ContextEngine pickup
        await this.pendingService.addPending(envelope);
        await message.ack(); // ack because we stored it locally
        this.logger.warn(`Gateway unavailable, stored pending event ${envelope.id}`);
      }
    } catch (err) {
      this.logger.error('Failed to process message', err);
      await message.nack(true);
    }
  }

  /**
   * Extract the NatsEventEnvelope from the adapter message.
   *
   * The JetStreamQueueAdapter wraps messages in its own envelope:
   *   { id, pattern, data, timestamp, metadata }
   *
   * Our NatsEventEnvelope is inside `data` when published via PublisherService,
   * or the raw data itself when published externally.
   */
  private extractEnvelope(message: Message<unknown>): NatsEventEnvelope {
    const data = message.data as any;

    // If the data already looks like a NatsEventEnvelope (has id, subject, payload),
    // use it directly.
    if (data && typeof data === 'object' && 'subject' in data && 'payload' in data) {
      return data as NatsEventEnvelope;
    }

    // Otherwise, treat it as a raw payload string that needs parsing
    if (typeof data === 'string') {
      return JSON.parse(data) as NatsEventEnvelope;
    }

    throw new Error('Unable to extract envelope from message');
  }

  private formatMessage(envelope: NatsEventEnvelope): string {
    return `[NATS:${envelope.subject}] ${JSON.stringify(envelope.payload)}`;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.subscription) {
      await this.subscription.unsubscribe();
      this.subscription = null;
    }
  }
}
