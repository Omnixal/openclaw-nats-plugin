import { Controller, BaseController, OnQueueReady, QueueService } from '@onebun/core';

/**
 * Ensures additional JetStream streams (agent_events, agent_dlq) exist
 * once the queue adapter is connected.
 */
@Controller('/nats-setup')
export class StreamSetupController extends BaseController {
  constructor(private queueService: QueueService) {
    super();
  }

  @OnQueueReady()
  async onReady(): Promise<void> {
    await this.ensureExtraStreams();
  }

  private async ensureExtraStreams(): Promise<void> {
    try {
      const adapter = this.queueService.getAdapter();
      const nc = (adapter as any)?.client?.getConnection?.();
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
