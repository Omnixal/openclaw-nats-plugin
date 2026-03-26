import { Service, BaseService, type OnModuleInit, type OnModuleDestroy } from '@onebun/core';
import { PendingService } from './pending.service';
import { GatewayClientService, GatewayRpcError } from '../gateway/gateway-client.service';
import { MetricsService } from '../metrics/metrics.service';
import { LogService } from '../logs/log.service';

@Service()
export class PendingFlushService extends BaseService implements OnModuleInit, OnModuleDestroy {
  private flushTimer?: ReturnType<typeof setInterval>;

  constructor(
    private pendingService: PendingService,
    private gatewayClient: GatewayClientService,
    private metrics: MetricsService,
    private logService: LogService,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    const intervalMs = this.config.get('pending.flushIntervalMs');
    this.flush().catch((e) => {
      this.logger.warn('Initial pending flush failed', { error: String(e) });
    });
    this.flushTimer = setInterval(() => {
      this.flush().catch((e) => {
        this.logger.warn('Pending flush failed', { error: String(e) });
      });
    }, intervalMs);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
  }

  async flush(): Promise<void> {
    if (!this.gatewayClient.isAlive()) {
      return;
    }

    const batchSize = this.config.get('pending.flushBatchSize');
    const pending = await this.pendingService.fetchPending('default', batchSize);
    if (pending.length === 0) {
      return;
    }

    this.logger.info(`Flushing ${pending.length} pending event(s)`);

    for (const event of pending) {
      try {
        const message = `[NATS:${event.subject}] ${JSON.stringify(event.payload)}`;
        await this.gatewayClient.inject({ message, eventId: event.id });
        await this.pendingService.markDelivered([event.id]);
        this.metrics.recordConsume(event.subject);
        await this.logService.logDelivery('pending-flush', event.subject, JSON.stringify({ eventId: event.id }));
      } catch (err) {
        await this.logService.logError('route', 'pending-flush', event.subject, err);
        if (err instanceof GatewayRpcError) {
          this.logger.error(`Pending flush: gateway rejected event ${event.id}: ${err.errorCode}`);
          continue;
        }
        this.logger.error(`Pending flush: network error on event ${event.id}, stopping batch`, err);
        break;
      }
    }
  }
}
