import { Service, BaseService, QueueService } from '@onebun/core';
import { GatewayClientService } from '../gateway/gateway-client.service';
import { PendingService } from '../pending/pending.service';

export interface HealthStatus {
  nats: { connected: boolean; url: string };
  gateway: { connected: boolean; url: string };
  pendingCount: number;
  uptimeSeconds: number;
  config: {
    streams: string[];
    consumerName: string;
    dedupTtlSeconds: number;
  };
}

@Service()
export class HealthService extends BaseService {
  private readonly startedAt = Date.now();

  constructor(
    private queueService: QueueService,
    private gateway: GatewayClientService,
    private pending: PendingService,
  ) {
    super();
  }

  private isQueueConnected(): boolean {
    try {
      return this.queueService.getAdapter().isConnected();
    } catch {
      return false;
    }
  }

  async getStatus(): Promise<HealthStatus> {
    const pendingCount = await this.pending.countPending();

    return {
      nats: {
        connected: this.isQueueConnected(),
        url: this.config.get('nats.servers'),
      },
      gateway: {
        connected: this.gateway.isAlive(),
        url: this.config.get('gateway.url'),
      },
      pendingCount,
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      config: {
        streams: ['agent_events', 'agent_dlq', 'scheduler_internal'],
        consumerName: this.config.get('consumer.name'),
        dedupTtlSeconds: this.config.get('dedup.ttlSeconds'),
      },
    };
  }
}
