import { OneBunApplication } from '@onebun/core';
import { AppModule } from './app.module';
import { envSchema } from './config';

const app = new OneBunApplication(AppModule, {
  development: Bun.env.NODE_ENV !== 'production',
  envSchema,
  envOptions: {
    loadDotEnv: true,
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
