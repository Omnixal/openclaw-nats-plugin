import { Module } from '@onebun/core';
import { DrizzleModule, DatabaseType } from '@onebun/drizzle';
import { DedupModule } from './dedup/dedup.module';
import { PublisherModule } from './publisher/publisher.module';
import { PreHandlersModule } from './pre-handlers/pre-handlers.module';
import { GatewayClientModule } from './gateway/gateway-client.module';
import { ConsumerModule } from './consumer/consumer.module';
import { PendingModule } from './pending/pending.module';
import { HealthModule } from './health/health.module';
import { RouterModule } from './router/router.module';

@Module({
  imports: [
    DrizzleModule.forRoot({
      connection: {
        type: DatabaseType.SQLITE,
        options: {
          url: process.env.DB_PATH ?? './data/nats-sidecar.db',
        },
      },
      migrationsFolder: './src/db/migrations',
    }),
    DedupModule,
    PublisherModule,
    PreHandlersModule,
    GatewayClientModule,
    ConsumerModule,
    PendingModule,
    HealthModule,
    RouterModule,
  ],
})
export class AppModule {}
