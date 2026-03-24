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
    process.env.OPENCLAW_GATEWAY_URL = 'http://127.0.0.1:19999';
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
              {
                name: 'scheduler_internal',
                subjects: ['scheduler.>'],
                retention: 'limits',
                maxAge: 24 * 60 * 60 * 1e9,
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

  // --- Route management ---

  it('GET /api/routes/status with auth returns not configured', async () => {
    const res = await module.inject('GET', '/api/routes/status', {
      headers: { 'Authorization': `Bearer ${API_KEY}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    const data = body.result ?? body;
    expect(data.configured).toBe(false);
    expect(data.count).toBe(0);
  });

  it('POST /api/routes creates a subscription', async () => {
    const res = await module.inject('POST', '/api/routes', {
      headers: { 'Authorization': `Bearer ${API_KEY}` },
      body: { pattern: 'agent.events.cron.*', target: 'main' },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    const data = body.result ?? body;
    expect(data.pattern).toBe('agent.events.cron.*');
    expect(data.target).toBe('main');
  });

  it('GET /api/routes lists subscriptions', async () => {
    const res = await module.inject('GET', '/api/routes', {
      headers: { 'Authorization': `Bearer ${API_KEY}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    const data = body.result ?? body;
    expect(data.length).toBeGreaterThan(0);
  });

  it('GET /api/routes?target=main filters by target', async () => {
    const res = await module.inject('GET', '/api/routes?target=main', {
      headers: { 'Authorization': `Bearer ${API_KEY}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    const data = body.result ?? body;
    expect(data.every((r: any) => r.target === 'main')).toBe(true);
  });

  it('POST /api/routes rejects bad pattern prefix', async () => {
    const res = await module.inject('POST', '/api/routes', {
      headers: { 'Authorization': `Bearer ${API_KEY}` },
      body: { pattern: 'bad.subject', target: 'main' },
    });
    const body = (await res.json()) as any;
    expect(body.success).toBe(false);
  });

  it('POST /api/routes requires auth', async () => {
    const res = await module.inject('POST', '/api/routes', {
      body: { pattern: 'agent.events.test.*', target: 'main' },
    });
    expect(res.status).toBe(401);
  });

  // --- Idempotent Subscribe (upsert) ---

  it('POST /api/routes with new pattern returns created=true', async () => {
    const res = await module.inject('POST', '/api/routes', {
      headers: { 'Authorization': `Bearer ${API_KEY}` },
      body: { pattern: 'agent.events.idempotent.test', target: 'main', priority: 3 },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    const data = body.result ?? body;
    expect(data.created).toBe(true);
    expect(data.pattern).toBe('agent.events.idempotent.test');
    expect(data.priority).toBe(3);
  });

  it('POST /api/routes with existing pattern upserts (created=false, new priority)', async () => {
    const res = await module.inject('POST', '/api/routes', {
      headers: { 'Authorization': `Bearer ${API_KEY}` },
      body: { pattern: 'agent.events.idempotent.test', target: 'main', priority: 8 },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    const data = body.result ?? body;
    expect(data.created).toBe(false);
    expect(data.priority).toBe(8);
  });

  // --- Route Health ---

  it('GET /api/routes/health returns per-route stats', async () => {
    const res = await module.inject('GET', '/api/routes/health', {
      headers: { 'Authorization': `Bearer ${API_KEY}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    const data = body.result ?? body;
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    // Each entry should have the health fields
    const entry = data[0];
    expect(entry).toHaveProperty('pattern');
    expect(entry).toHaveProperty('target');
    expect(entry).toHaveProperty('enabled');
    expect(entry).toHaveProperty('deliveryCount');
    expect(entry).toHaveProperty('lagMs');
  });

  it('Routes without deliveries have null lagMs', async () => {
    const res = await module.inject('GET', '/api/routes/health', {
      headers: { 'Authorization': `Bearer ${API_KEY}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    const data = body.result ?? body;
    // Find a route that has not had any deliveries (deliveryCount === 0)
    const undelivered = data.find((r: any) => r.deliveryCount === 0);
    expect(undelivered).toBeDefined();
    expect(undelivered.lagMs).toBeNull();
    expect(undelivered.lastDeliveredAt).toBeNull();
  });

  // --- Scheduler CRUD ---

  it('POST /api/cron creates a job', async () => {
    const res = await module.inject('POST', '/api/cron', {
      headers: { 'Authorization': `Bearer ${API_KEY}` },
      body: {
        name: 'test-daily',
        cron: '0 9 * * *',
        subject: 'agent.events.cron.daily',
        payload: { task: 'report' },
      },
    });
    const body = (await res.json()) as any;
    expect(res.status).toBe(200);
    const data = body.result ?? body;
    expect(data.name).toBe('test-daily');
    expect(data.expr).toBe('0 9 * * *');
    expect(data.subject).toBe('agent.events.cron.daily');
  });

  it('GET /api/cron lists jobs', async () => {
    const res = await module.inject('GET', '/api/cron', {
      headers: { 'Authorization': `Bearer ${API_KEY}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    const data = body.result ?? body;
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    const job = data.find((j: any) => j.name === 'test-daily');
    expect(job).toBeDefined();
    expect(job.expr).toBe('0 9 * * *');
  });

  it('POST /api/cron with same name upserts (no duplicate)', async () => {
    const res = await module.inject('POST', '/api/cron', {
      headers: { 'Authorization': `Bearer ${API_KEY}` },
      body: {
        name: 'test-daily',
        cron: '0 10 * * *',
        subject: 'agent.events.cron.daily',
        payload: { task: 'updated-report' },
      },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    const data = body.result ?? body;
    expect(data.name).toBe('test-daily');
    expect(data.expr).toBe('0 10 * * *');

    // Verify only one job with that name exists
    const listRes = await module.inject('GET', '/api/cron', {
      headers: { 'Authorization': `Bearer ${API_KEY}` },
    });
    const listBody = (await listRes.json()) as any;
    const listData = listBody.result ?? listBody;
    const matches = listData.filter((j: any) => j.name === 'test-daily');
    expect(matches.length).toBe(1);
    expect(matches[0].expr).toBe('0 10 * * *');
  });

  it('POST /api/cron rejects non agent.events.* subjects', async () => {
    const res = await module.inject('POST', '/api/cron', {
      headers: { 'Authorization': `Bearer ${API_KEY}` },
      body: {
        name: 'bad-cron',
        cron: '0 9 * * *',
        subject: 'other.topic',
      },
    });
    const body = (await res.json()) as any;
    expect(body.success).toBe(false);
  });

  it('POST /api/cron requires auth', async () => {
    const res = await module.inject('POST', '/api/cron', {
      body: { name: 'no-auth', cron: '0 9 * * *', subject: 'agent.events.test' },
    });
    expect(res.status).toBe(401);
  });

  it('DELETE /api/cron/:name removes a job', async () => {
    // First create a job to delete
    await module.inject('POST', '/api/cron', {
      headers: { 'Authorization': `Bearer ${API_KEY}` },
      body: {
        name: 'to-delete',
        cron: '0 0 * * *',
        subject: 'agent.events.cron.cleanup',
      },
    });

    const delRes = await module.inject('DELETE', '/api/cron/to-delete', {
      headers: { 'Authorization': `Bearer ${API_KEY}` },
    });
    expect(delRes.status).toBe(200);
    const delBody = (await delRes.json()) as any;
    const delData = delBody.result ?? delBody;
    expect(delData.deleted).toBe(true);

    // Verify it's gone
    const listRes = await module.inject('GET', '/api/cron', {
      headers: { 'Authorization': `Bearer ${API_KEY}` },
    });
    const listBody = (await listRes.json()) as any;
    const listData = listBody.result ?? listBody;
    const found = listData.find((j: any) => j.name === 'to-delete');
    expect(found).toBeUndefined();
  });

  it('DELETE /api/cron/:name returns 404 for non-existent job', async () => {
    const res = await module.inject('DELETE', '/api/cron/non-existent-job', {
      headers: { 'Authorization': `Bearer ${API_KEY}` },
    });
    expect(res.status).toBe(404);
  });
});
