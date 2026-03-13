import { Service, BaseService, type OnModuleInit, type OnModuleDestroy } from '@onebun/core';
import type { Subscription, MessageHandler, SubscribeOptions, PublishOptions } from '@onebun/core';
import { JetStreamQueueAdapter, type JetStreamAdapterOptions } from '@onebun/nats';

/**
 * Manages the JetStreamQueueAdapter lifecycle with graceful degradation.
 *
 * When NATS is unavailable, the service runs in degraded mode:
 * publish and subscribe operations are silently dropped with warnings.
 *
 * Also ensures additional streams (agent_events, agent_dlq) exist.
 */
@Service()
export class NatsAdapterService extends BaseService implements OnModuleInit, OnModuleDestroy {
  private adapter: JetStreamQueueAdapter | null = null;
  private _connected = false;

  async onModuleInit(): Promise<void> {
    const servers = this.config.get('nats.servers');
    const reconnectTimeWait = this.config.get('nats.reconnectDelayMs');
    const maxReconnectAttempts = this.config.get('nats.maxReconnectAttempts');
    const ackWaitMs = this.config.get('consumer.ackWaitMs');
    const maxDeliver = this.config.get('consumer.maxDeliver');

    const options: JetStreamAdapterOptions = {
      servers,
      maxReconnectAttempts,
      reconnectTimeWait,
      stream: 'agent_inbound',
      createStream: true,
      streamConfig: {
        subjects: ['agent.inbound.>'],
        retention: 'workqueue',
        storage: 'file',
        replicas: 1,
      },
      consumerConfig: {
        ackWait: ackWaitMs * 1_000_000, // ms → ns
        maxDeliver,
      },
    };

    this.adapter = new JetStreamQueueAdapter(options);

    try {
      await this.adapter.connect();
      this._connected = true;
      await this.ensureExtraStreams();
      this.logger.info('NATS JetStream connected');
    } catch (err: any) {
      this.logger.warn(`NATS connection failed, running in degraded mode: ${err?.message}`);
      this.adapter = null;
      this._connected = false;
    }
  }

  isConnected(): boolean {
    return this._connected && this.adapter !== null && this.adapter.isConnected();
  }

  async publish<T>(pattern: string, data: T, options?: PublishOptions): Promise<string | null> {
    if (!this.adapter || !this.isConnected()) {
      this.logger.warn(`NATS not connected, dropping publish to ${pattern}`);
      return null;
    }
    return await this.adapter.publish(pattern, data, options);
  }

  async subscribe<T>(
    pattern: string,
    handler: MessageHandler<T>,
    options?: SubscribeOptions,
  ): Promise<Subscription | null> {
    if (!this.adapter || !this.isConnected()) {
      this.logger.warn(`NATS not connected, cannot subscribe to ${pattern}`);
      return null;
    }
    return await this.adapter.subscribe(pattern, handler, options);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.adapter) {
      await this.adapter.disconnect();
      this.logger.info('NATS JetStream disconnected');
    }
  }

  private async ensureExtraStreams(): Promise<void> {
    try {
      const nc = (this.adapter as any)?.client?.getConnection?.();
      if (!nc) {
        this.logger.warn('Cannot access NATS connection for stream creation');
        return;
      }

      const jsModule = await import('@nats-io/jetstream');
      const jsm = await jsModule.jetstreamManager(nc);

      const SEVEN_DAYS_NS = 7 * 24 * 60 * 60 * 1e9;

      await this.ensureStream(jsm, {
        name: 'agent_events',
        subjects: ['agent.events.>'],
        retention: 'limits',
        max_age: SEVEN_DAYS_NS,
        storage: 'file',
        num_replicas: 1,
      });

      await this.ensureStream(jsm, {
        name: 'agent_dlq',
        subjects: ['agent.dlq.>'],
        retention: 'limits',
        max_age: SEVEN_DAYS_NS,
        storage: 'file',
        num_replicas: 1,
      });

      this.logger.info('Additional JetStream streams ensured (agent_events, agent_dlq)');
    } catch (err: any) {
      this.logger.warn(`Failed to ensure extra streams: ${err?.message}`);
    }
  }

  private async ensureStream(jsm: any, config: Record<string, any>): Promise<void> {
    try {
      await jsm.streams.info(config.name);
      await jsm.streams.update(config.name, config);
    } catch {
      await jsm.streams.add(config);
    }
  }
}
