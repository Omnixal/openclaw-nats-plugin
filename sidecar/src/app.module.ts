import { getConfig, Module } from '@onebun/core';
import { DrizzleModule, DatabaseType } from '@onebun/drizzle';
import { envSchema, type AppConfig } from './config';
import { DedupModule } from './dedup/dedup.module';
import { PublisherModule } from './publisher/publisher.module';
import { PreHandlersModule } from './pre-handlers/pre-handlers.module';
import { GatewayClientModule } from './gateway/gateway-client.module';
import { ConsumerModule } from './consumer/consumer.module';
import { PendingModule } from './pending/pending.module';
import { HealthModule } from './health/health.module';
import { RouterModule } from './router/router.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { MetricsModule } from './metrics/metrics.module';
import { LogModule } from './logs/log.module';

const config = getConfig<AppConfig>(envSchema);

@Module({
  imports: [
    DrizzleModule.forRoot({
      connection: {
        type: DatabaseType.SQLITE,
        options: {
          url: config.get('database.url'),
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
    SchedulerModule,
    MetricsModule,
    LogModule,
  ],
})
export class AppModule {}
