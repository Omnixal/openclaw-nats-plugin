import { OneBunApplication } from '@onebun/core';
import { JetStreamQueueAdapter, type JetStreamAdapterOptions } from '@onebun/nats';
import { AppModule } from './app.module';
import { envSchema } from './config';

const natsServers = Bun.env.NATS_SERVERS ?? 'nats://localhost:4222';
const ackWaitMs = Number(Bun.env.NATS_ACK_WAIT_MS ?? 30000);
const maxDeliver = Number(Bun.env.NATS_MAX_DELIVER ?? 3);

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
