import { Controller, BaseController, Subscribe, OnQueueReady, type Message } from '@onebun/core';
import { PipelineService } from '../pre-handlers/pipeline.service';
import { GatewayClientService, GatewayRpcError } from '../gateway/gateway-client.service';
import { PendingService } from '../pending/pending.service';
import { RouterService } from '../router/router.service';
import { MetricsService } from '../metrics/metrics.service';
import { LogService } from '../logs/log.service';
import type { NatsEventEnvelope } from '../publisher/envelope';

@Controller('/consumer')
export class ConsumerController extends BaseController {
  constructor(
    private pipeline: PipelineService,
    private gatewayClient: GatewayClientService,
    private pendingService: PendingService,
    private routerService: RouterService,
    private metrics: MetricsService,
    private logService: LogService,
  ) {
    super();
  }

  @OnQueueReady()
  onReady() {
    const consumerName = this.config.get('consumer.name');
    this.logger.info(`Queue connected, consuming as ${consumerName}`);
  }

  @Subscribe('agent.events.#', {
    ackMode: 'manual',
    group: 'openclaw-main',
  })
  async handleInbound(message: Message<unknown>): Promise<void> {
    try {
      const envelope = this.extractEnvelope(message);
      this.logger.info(`Inbound event: ${envelope.subject} (id=${envelope.id})`);

      const { result, ctx } = await this.pipeline.process(envelope);
      if (result === 'drop') {
        this.logger.debug(`Event dropped by pipeline: ${envelope.id}`);
        await message.ack();
        return;
      }

      // Check routing rules
      const routes = await this.routerService.findMatchingRoutes(envelope.subject);
      if (routes.length === 0) {
        this.logger.debug(`No matching routes for ${envelope.subject}`);
        // No route — just ack (event is in JetStream for audit)
        await message.ack();
        return;
      }
      this.logger.info(`Matched ${routes.length} route(s) for ${envelope.subject}`);

      // Deliver to each matching target
      if (this.gatewayClient.isAlive()) {
        for (const route of routes) {
          try {
            const injectStart = performance.now();
            await this.gatewayClient.inject({
              message: this.formatMessage(envelope),
              eventId: envelope.id,
            });
            const lagMs = Math.round(performance.now() - injectStart);
            await this.routerService.recordDelivery(route.id, envelope.subject, lagMs);
            this.metrics.recordConsume(envelope.subject);
            await this.logService.logDelivery(route.id, envelope.subject, JSON.stringify({ eventId: envelope.id, target: route.target }));
          } catch (routeErr) {
            await this.logService.logError('route', route.id, envelope.subject, routeErr);
            // Gateway rejected the request (e.g. missing scope) — store in pending, don't nack
            if (routeErr instanceof GatewayRpcError) {
              this.logger.error(`Gateway rejected event ${envelope.id}: ${routeErr.errorCode} — ${routeErr.errorMessage}`);
              await this.pendingService.addPending(envelope);
              await message.ack();
              return;
            }
            throw routeErr;
          }
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
