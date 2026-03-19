import { OneBunApplication } from '@onebun/core';
import { JetStreamQueueAdapter, type JetStreamAdapterOptions } from '@onebun/nats';
import { AppModule } from './app.module';
import { envSchema } from './config';

const natsServers = Bun.env.NATS_SERVERS ?? 'nats://localhost:4222';
const ackWaitMs = Number(Bun.env.NATS_ACK_WAIT_MS ?? 30000);
const maxDeliver = Number(Bun.env.NATS_MAX_DELIVER ?? 3);
const SEVEN_DAYS_NS = 7 * 24 * 60 * 60 * 1e9;

const app = new OneBunApplication(AppModule, {
  development: Bun.env.NODE_ENV !== 'production',
  envSchema,
  envOptions: {
    loadDotEnv: true,
  },
  queue: {
    adapter: JetStreamQueueAdapter as any,
    options: {
      servers: natsServers,
      streamDefaults: {
        storage: 'file',
        replicas: 1,
      },
      streams: [
        {
          name: 'agent_events',
          subjects: ['agent.events.>'],
          retention: 'limits',
          maxAge: SEVEN_DAYS_NS,
        },
        {
          name: 'agent_dlq',
          subjects: ['agent.dlq.>'],
          retention: 'limits',
          maxAge: SEVEN_DAYS_NS,
        },
      ],
      consumerConfig: {
        ackWait: ackWaitMs * 1_000_000, // ms → ns
        maxDeliver,
      },
    } as JetStreamAdapterOptions,
  },
});

app.start()
  .then(() => {
    const logger = app.getLogger({ className: 'Bootstrap' });
    logger.info('nats-sidecar started');
  })
  .catch((error) => {
    console.error('Failed to start:', error);
    process.exit(1);
  });
