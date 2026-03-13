import { Service, BaseService } from '@onebun/core';
import { NatsAdapterService } from '../nats-streams/nats-adapter.service';
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
    private nats: NatsAdapterService,
    private gateway: GatewayClientService,
    private pending: PendingService,
  ) {
    super();
  }

  async getStatus(): Promise<HealthStatus> {
    const pendingCount = await this.pending.countPending();

    return {
      nats: {
        connected: this.nats.isConnected(),
        url: this.config.get('nats.servers'),
      },
      gateway: {
        connected: this.gateway.isAlive(),
        url: this.config.get('gateway.wsUrl'),
      },
      pendingCount,
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      config: {
        streams: ['agent_inbound', 'agent_events', 'agent_dlq'],
        consumerName: this.config.get('consumer.name'),
        dedupTtlSeconds: this.config.get('dedup.ttlSeconds'),
      },
    };
  }
}
