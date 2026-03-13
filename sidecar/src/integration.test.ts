import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { resolve } from 'node:path';

const TEST_PORT = 3114;
const TEST_DB = `/tmp/nats-sidecar-test-${Date.now()}.db`;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const API_KEY = 'test-nats-plugin-key';

let proc: ReturnType<typeof Bun.spawn>;

describe('nats-sidecar integration', () => {
  beforeAll(async () => {
    proc = Bun.spawn(['bun', 'run', 'src/index.ts'], {
      cwd: resolve(import.meta.dir, '..'),
      env: {
        ...process.env,
        PORT: String(TEST_PORT),
        DB_PATH: TEST_DB,
        NATS_PLUGIN_API_KEY: API_KEY,
        NATS_SERVERS: 'nats://localhost:14222', // non-existent, will fail gracefully
        NATS_MAX_RECONNECT_ATTEMPTS: '0',
        OPENCLAW_WS_URL: '', // disable gateway client
        NODE_ENV: 'test',
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });

    // Wait for server ready by polling an authenticated endpoint
    let ready = false;
    for (let i = 0; i < 50; i++) {
      try {
        const res = await fetch(`${BASE_URL}/api/pending/test-session`, {
          headers: { 'Authorization': `Bearer ${API_KEY}` },
        });
        if (res.ok) {
          ready = true;
          break;
        }
      } catch {
        // Server not ready yet
      }
      await new Promise((r) => setTimeout(r, 200));
    }

    if (!ready) {
      const errText = proc.stderr && typeof proc.stderr !== 'number'
        ? await new Response(proc.stderr).text().catch(() => '(unreadable)')
        : '(no stderr)';
      throw new Error(`Server failed to start within 10s. stderr:\n${errText}`);
    }
  });

  afterAll(async () => {
    proc?.kill();
    await new Promise((r) => setTimeout(r, 200));
    try {
      const { unlinkSync } = await import('node:fs');
      unlinkSync(TEST_DB);
    } catch {}
  });

  // --- Auth tests ---

  it('POST /api/publish requires auth', async () => {
    const res = await fetch(`${BASE_URL}/api/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject: 'test', payload: {} }),
    });
    expect(res.status).toBe(401);
  });

  it('GET /api/pending/:sessionKey requires auth', async () => {
    const res = await fetch(`${BASE_URL}/api/pending/test-session`);
    expect(res.status).toBe(401);
  });

  it('POST /api/pending/mark-delivered requires auth', async () => {
    const res = await fetch(`${BASE_URL}/api/pending/mark-delivered`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [] }),
    });
    expect(res.status).toBe(401);
  });

  // --- Publish endpoint (NATS unavailable) ---

  it('POST /api/publish with valid auth returns non-401 (NATS down)', async () => {
    const res = await fetch(`${BASE_URL}/api/publish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({ subject: 'agent.events.test', payload: { test: true } }),
    });
    // Auth passes but NATS is not connected — expect 500
    expect(res.status).not.toBe(401);
  });

  // --- Pending endpoints (SQLite-backed, work without NATS) ---

  it('GET /api/pending/:sessionKey with auth returns empty array', async () => {
    const res = await fetch(`${BASE_URL}/api/pending/test-session`, {
      headers: { 'Authorization': `Bearer ${API_KEY}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    const data = (body as any).result ?? (body as any).data ?? body;
    expect(data).toEqual([]);
  });

  it('POST /api/pending/mark-delivered with auth and empty ids', async () => {
    const res = await fetch(`${BASE_URL}/api/pending/mark-delivered`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({ ids: [] }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    const data = (body as any).result ?? (body as any).data ?? body;
    expect(data.marked).toBe(0);
  });
});
