import { describe, it, expect, beforeEach, afterEach, mock, jest } from 'bun:test';
import { GatewayClientService } from './gateway-client.service';

/* ---------- helpers ---------- */

/** Minimal mock WebSocket that tracks calls. */
function createMockWs() {
  const ws: Record<string, any> = {
    readyState: 1, // WebSocket.OPEN
    send: mock(() => {}),
    close: mock(() => {}),
    onopen: null as ((ev?: any) => void) | null,
    onmessage: null as ((ev?: any) => void) | null,
    onclose: null as ((ev?: any) => void) | null,
    onerror: null as ((ev?: any) => void) | null,
  };
  return ws;
}

function createService(): GatewayClientService {
  const svc = new GatewayClientService() as any;
  // Provide minimal stubs for BaseService dependencies
  svc.config = {
    get: mock((key: string) => {
      if (key === 'gateway.wsUrl') return 'ws://localhost:18789';
      if (key === 'gateway.token') return 'test-token';
      return '';
    }),
  };
  svc.logger = {
    info: mock(() => {}),
    warn: mock(() => {}),
    debug: mock(() => {}),
    error: mock(() => {}),
  };
  return svc as GatewayClientService;
}

/* ---------- tests ---------- */

describe('GatewayClientService', () => {
  let service: GatewayClientService;

  beforeEach(() => {
    service = createService();
  });

  afterEach(async () => {
    await (service as any).onModuleDestroy?.();
  });

  it('isAlive() returns false when not connected', () => {
    expect(service.isAlive()).toBe(false);
  });

  it('isAlive() returns true after successful connect + response', () => {
    const ws = createMockWs();
    (service as any).ws = ws;
    (service as any).connected = true;
    expect(service.isAlive()).toBe(true);
  });

  it('isAlive() returns false when ws exists but readyState is not OPEN', () => {
    const ws = createMockWs();
    ws.readyState = 3; // CLOSED
    (service as any).ws = ws;
    (service as any).connected = true;
    expect(service.isAlive()).toBe(false);
  });

  it('inject() throws when not connected', async () => {
    expect(
      service.inject({
        target: 'main',
        message: 'hello',
        metadata: { source: 'nats', eventId: 'e1', subject: 'agent.inbound.test', priority: 5 },
      }),
    ).rejects.toThrow('Gateway WebSocket not connected');
  });

  it('inject() sends correct frame with send method and idempotencyKey', async () => {
    const ws = createMockWs();
    (service as any).ws = ws;
    (service as any).connected = true;
    (service as any).requestId = 10;

    await service.inject({
      target: 'main',
      message: 'event payload',
      metadata: { source: 'nats', eventId: 'evt-42', subject: 'agent.inbound.task', priority: 3 },
    });

    expect(ws.send).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(ws.send.mock.calls[0][0]);
    expect(sent).toEqual({
      type: 'req',
      id: 11,
      method: 'send',
      params: {
        target: 'main',
        message: 'event payload',
        metadata: { source: 'nats', eventId: 'evt-42', subject: 'agent.inbound.task', priority: 3 },
        idempotencyKey: 'evt-42',
      },
    });
  });

  it('inject() uses requestId as idempotencyKey when metadata.eventId is absent', async () => {
    const ws = createMockWs();
    (service as any).ws = ws;
    (service as any).connected = true;
    (service as any).requestId = 5;

    await service.inject({ target: 'main', message: 'no-meta' });

    const sent = JSON.parse(ws.send.mock.calls[0][0]);
    expect(sent.params.idempotencyKey).toBe('6');
  });

  it('onModuleDestroy() closes WebSocket and clears timers', async () => {
    const ws = createMockWs();
    (service as any).ws = ws;
    (service as any).connected = true;
    (service as any).reconnectTimer = setTimeout(() => {}, 99999);

    await (service as any).onModuleDestroy();

    expect(ws.close).toHaveBeenCalledTimes(1);
    expect((service as any).ws).toBeNull();
    expect((service as any).connected).toBe(false);
    expect((service as any).reconnectTimer).toBeNull();
  });

  it('scheduleReconnect uses exponential backoff', () => {
    // We cannot easily observe setTimeout delay, but we can verify
    // reconnectAttempt increments and timers are set.
    (service as any).wsUrl = 'ws://localhost:18789';

    (service as any).reconnectAttempt = 0;
    (service as any).scheduleReconnect();
    expect((service as any).reconnectAttempt).toBe(1);
    expect((service as any).reconnectTimer).not.toBeNull();

    // Clear for next call
    clearTimeout((service as any).reconnectTimer);
    (service as any).reconnectTimer = null;

    (service as any).reconnectAttempt = 1;
    (service as any).scheduleReconnect();
    expect((service as any).reconnectAttempt).toBe(2);

    // Duplicate call while timer exists should be a no-op
    const timer = (service as any).reconnectTimer;
    (service as any).scheduleReconnect();
    expect((service as any).reconnectTimer).toBe(timer); // same timer, not replaced
    expect((service as any).reconnectAttempt).toBe(2); // not incremented again
  });

  it('sendConnect sends correct connect frame', () => {
    const ws = createMockWs();
    (service as any).ws = ws;
    (service as any).requestId = 0;

    (service as any).sendConnect();

    expect(ws.send).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(ws.send.mock.calls[0][0]);
    expect(sent).toEqual({
      type: 'req',
      id: 1,
      method: 'connect',
      params: {},
    });
  });

  it('onmessage handler sets connected=true on ok response', () => {
    const ws = createMockWs();
    (service as any).ws = ws;
    (service as any).connected = false;

    // Simulate the onmessage handler logic
    (service as any).handleMessage({ data: JSON.stringify({ type: 'res', ok: true, id: 1 }) });
    expect((service as any).connected).toBe(true);
  });

  it('onmessage handler ignores non-ok responses', () => {
    const ws = createMockWs();
    (service as any).ws = ws;
    (service as any).connected = false;

    (service as any).handleMessage({ data: JSON.stringify({ type: 'res', ok: false, id: 1 }) });
    expect((service as any).connected).toBe(false);
  });
});
