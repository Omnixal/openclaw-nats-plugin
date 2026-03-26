import { Env, type InferConfigType } from '@onebun/core';

export const envSchema = {
  server: {
    port: Env.number({ default: 3104, env: 'PORT' }),
    host: Env.string({ default: '0.0.0.0', env: 'HOST' }),
    nodeEnv: Env.string({ default: 'development', env: 'NODE_ENV' }),
  },
  database: {
    url: Env.string({ default: './data/nats-sidecar.db', env: 'DB_PATH' }),
  },
  nats: {
    servers: Env.string({ default: 'nats://localhost:4222', env: 'NATS_SERVERS' }),
    nkeyFile: Env.string({ default: '', env: 'NATS_NKEY_FILE' }),
    reconnectDelayMs: Env.number({ default: 1000, env: 'NATS_RECONNECT_DELAY_MS' }),
    maxReconnectAttempts: Env.number({ default: -1, env: 'NATS_MAX_RECONNECT_ATTEMPTS' }),
  },
  gateway: {
    url: Env.string({ default: 'http://localhost:18789', env: 'OPENCLAW_GATEWAY_URL' }),
    hookToken: Env.string({ default: '', env: 'OPENCLAW_HOOK_TOKEN' }),
  },
  consumer: {
    name: Env.string({ default: 'openclaw-main', env: 'NATS_CONSUMER_NAME' }),
    maxDeliver: Env.number({ default: 3, env: 'NATS_MAX_DELIVER' }),
    ackWaitMs: Env.number({ default: 30000, env: 'NATS_ACK_WAIT_MS' }),
  },
  dedup: {
    ttlSeconds: Env.number({ default: 60, env: 'NATS_DEDUP_TTL_SECONDS' }),
    cleanupIntervalMs: Env.number({ default: 300000, env: 'NATS_DEDUP_CLEANUP_INTERVAL_MS' }),
  },
  pending: {
    flushIntervalMs: Env.number({ default: 30000, env: 'NATS_PENDING_FLUSH_INTERVAL_MS' }),
    flushBatchSize: Env.number({ default: 10, env: 'NATS_PENDING_FLUSH_BATCH_SIZE' }),
  },
  auth: {
    pluginApiKey: Env.string({ default: 'dev-nats-plugin-key', env: 'NATS_PLUGIN_API_KEY' }),
  },
};

export type AppConfig = InferConfigType<typeof envSchema>;

declare module '@onebun/core' {
  interface OneBunAppConfig extends AppConfig {}
}
