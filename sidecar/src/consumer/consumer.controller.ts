import { Controller, BaseController, Subscribe, OnQueueReady, type Message } from '@onebun/core';
import { PipelineService } from '../pre-handlers/pipeline.service';
import { GatewayClientService } from '../gateway/gateway-client.service';
import { PendingService } from '../pending/pending.service';
import { RouterService } from '../router/router.service';
import type { NatsEventEnvelope } from '../publisher/envelope';

@Controller('/consumer')
export class ConsumerController extends BaseController {
  constructor(
    private pipeline: PipelineService,
    private gatewayClient: GatewayClientService,
    private pendingService: PendingService,
    private routerService: RouterService,
  ) {
    super();
  }

  @OnQueueReady()
  onReady() {
    const consumerName = this.config.get('consumer.name');
    this.logger.info(`Queue connected, consuming as ${consumerName}`);
  }

  @Subscribe('agent.events.>', {
    ackMode: 'manual',
    group: 'openclaw-main',
  })
  async handleInbound(message: Message<unknown>): Promise<void> {
    try {
      const envelope = this.extractEnvelope(message);

      const { result, ctx } = await this.pipeline.process(envelope);
      if (result === 'drop') {
        await message.ack();
        return;
      }

      // Check routing rules
      const routes = await this.routerService.findMatchingRoutes(envelope.subject);
      if (routes.length === 0) {
        // No route — just ack (event is in JetStream for audit)
        await message.ack();
        return;
      }

      // Deliver to each matching target
      if (this.gatewayClient.isAlive()) {
        for (const route of routes) {
          await this.gatewayClient.inject({
            target: route.target,
            message: this.formatMessage(envelope),
            metadata: {
              source: 'nats',
              eventId: envelope.id,
              subject: envelope.subject,
              priority: (ctx.enrichments['priority'] as number) ?? envelope.meta?.priority ?? 5,
            },
          });
          await this.routerService.recordDelivery(route.id, envelope.subject);
        }
        await message.ack();
      } else {
        await this.pendingService.addPending(envelope);
        await message.ack();
        this.logger.warn(`Gateway unavailable, stored pending event ${envelope.id}`);
      }
    } catch (err) {
      this.logger.error('Failed to process message', err);
      await message.nack(true);
    }
  }

  private extractEnvelope(message: Message<unknown>): NatsEventEnvelope {
    const data = message.data as any;
    if (data && typeof data === 'object' && 'subject' in data && 'payload' in data) {
      return data as NatsEventEnvelope;
    }
    if (typeof data === 'string') {
      return JSON.parse(data) as NatsEventEnvelope;
    }
    throw new Error('Unable to extract envelope from message');
  }

  private formatMessage(envelope: NatsEventEnvelope): string {
    return `[NATS:${envelope.subject}] ${JSON.stringify(envelope.payload)}`;
  }
}
