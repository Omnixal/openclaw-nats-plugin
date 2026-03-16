import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { createNatsContainer, type TestContainer, type CompiledTestingModule } from '@onebun/core/testing';

const TEST_DB = `/tmp/nats-sidecar-test-${Date.now()}.db`;
const API_KEY = 'test-nats-plugin-key';
const SEVEN_DAYS_NS = 7 * 24 * 60 * 60 * 1e9;

let nats: TestContainer;
let module: CompiledTestingModule;

describe('nats-sidecar integration', () => {
  beforeAll(async () => {
    // 1. Start NATS with JetStream
    nats = await createNatsContainer({ enableJetStream: true });

    // 2. Set env vars BEFORE importing AppModule (decorator reads process.env at import time)
    process.env.DB_PATH = TEST_DB;
    process.env.NATS_PLUGIN_API_KEY = API_KEY;
    process.env.NATS_SERVERS = nats.url;
    process.env.NATS_MAX_RECONNECT_ATTEMPTS = '3';
    process.env.OPENCLAW_WS_URL = 'ws://127.0.0.1:19999';
    process.env.NODE_ENV = 'test';

    // 3. Dynamic import so @Module decorator sees the env vars above
    const { TestingModule } = await import('@onebun/core/testing');
    const { JetStreamQueueAdapter } = await import('@onebun/nats');
    const { AppModule } = await import('./app.module');
    const { envSchema } = await import('./config');

    // 4. Create and start via TestingModule
    module = await TestingModule
      .create({ imports: [AppModule] })
      .setOptions({
        development: true,
        envSchema,
        envOptions: { loadDotEnv: false },
        queue: {
          adapter: JetStreamQueueAdapter as any,
          options: {
            servers: nats.url,
            streamDefaults: {
              storage: 'file',
              replicas: 1,
            },
            streams: [
              {
                name: 'agent_inbound',
                subjects: ['agent.inbound.>'],
                retention: 'workqueue',
              },
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
              ackWait: 30_000 * 1_000_000,
              maxDeliver: 3,
            },
          },
        },
      })
      .compile();
  }, 60_000);

  afterAll(async () => {
    await module?.close();
    await nats?.stop();
    try {
      const { unlinkSync } = await import('node:fs');
      unlinkSync(TEST_DB);
    } catch {}
  });

  // --- Health ---

  it('GET /api/health returns status with NATS connected', async () => {
    const res = await module.inject('GET', '/api/health');
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    const data = body.result ?? body;

    expect(data.nats.connected).toBe(true);
    expect(data.nats.url).toBe(nats.url);
  });

  // --- Auth tests ---

  it('POST /api/publish requires auth', async () => {
    const res = await module.inject('POST', '/api/publish', {
      body: { subject: 'test', payload: {} },
    });
    expect(res.status).toBe(401);
  });

  it('GET /api/pending/:sessionKey requires auth', async () => {
    const res = await module.inject('GET', '/api/pending/test-session');
    expect(res.status).toBe(401);
  });

  it('POST /api/pending/mark-delivered requires auth', async () => {
    const res = await module.inject('POST', '/api/pending/mark-delivered', {
      body: { ids: [] },
    });
    expect(res.status).toBe(401);
  });

  // --- Publish endpoint (NATS connected) ---

  it('POST /api/publish with valid auth and valid subject succeeds', async () => {
    const res = await module.inject('POST', '/api/publish', {
      headers: { 'Authorization': `Bearer ${API_KEY}` },
      body: { subject: 'agent.events.test', payload: { test: true } },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    const data = body.result ?? body;
    expect(data.published).toBe(true);
  });

  it('POST /api/publish rejects non agent.events.* subjects', async () => {
    const res = await module.inject('POST', '/api/publish', {
      headers: { 'Authorization': `Bearer ${API_KEY}` },
      body: { subject: 'other.topic', payload: {} },
    });
    expect(res.status).not.toBe(401);
    const body = (await res.json()) as any;
    expect(body.success).toBe(false);
  });

  // --- Pending endpoints (SQLite-backed) ---

  it('GET /api/pending/:sessionKey with auth returns empty array', async () => {
    const res = await module.inject('GET', '/api/pending/test-session', {
      headers: { 'Authorization': `Bearer ${API_KEY}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    const data = body.result ?? body.data ?? body;
    expect(data).toEqual([]);
  });

  it('POST /api/pending/mark-delivered with auth and empty ids', async () => {
    const res = await module.inject('POST', '/api/pending/mark-delivered', {
      headers: { 'Authorization': `Bearer ${API_KEY}` },
      body: { ids: [] },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    const data = body.result ?? body.data ?? body;
    expect(data.marked).toBe(0);
  });
});
