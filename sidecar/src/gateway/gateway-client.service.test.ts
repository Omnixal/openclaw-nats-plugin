import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
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

  it('isAlive() returns true after successful handshake', () => {
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

  it('inject() sends correct frame with rpc- prefixed id and idempotencyKey', async () => {
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
      id: 'rpc-11',
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

  it('onModuleDestroy() closes WebSocket and clears state', async () => {
    const ws = createMockWs();
    (service as any).ws = ws;
    (service as any).connected = true;
    (service as any).connectSent = true;
    (service as any).reconnectTimer = setTimeout(() => {}, 99999);

    await (service as any).onModuleDestroy();

    expect(ws.close).toHaveBeenCalledTimes(1);
    expect((service as any).ws).toBeNull();
    expect((service as any).connected).toBe(false);
    expect((service as any).connectSent).toBe(false);
    expect((service as any).reconnectTimer).toBeNull();
  });

  it('scheduleReconnect uses exponential backoff', () => {
    (service as any).wsUrl = 'ws://localhost:18789';

    (service as any).reconnectAttempt = 0;
    (service as any).scheduleReconnect();
    expect((service as any).reconnectAttempt).toBe(1);
    expect((service as any).reconnectTimer).not.toBeNull();

    clearTimeout((service as any).reconnectTimer);
    (service as any).reconnectTimer = null;

    (service as any).reconnectAttempt = 1;
    (service as any).scheduleReconnect();
    expect((service as any).reconnectAttempt).toBe(2);

    // Duplicate call while timer exists should be a no-op
    const timer = (service as any).reconnectTimer;
    (service as any).scheduleReconnect();
    expect((service as any).reconnectTimer).toBe(timer);
    expect((service as any).reconnectAttempt).toBe(2);
  });

  // --- Handshake protocol ---

  it('sendConnectFrame sends full protocol handshake with auth token', () => {
    const ws = createMockWs();
    (service as any).ws = ws;
    (service as any).token = 'test-token';
    (service as any).requestId = 0;

    (service as any).sendConnectFrame();

    expect(ws.send).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(ws.send.mock.calls[0][0]);
    expect(sent.type).toBe('req');
    expect(sent.id).toBe('connect-1');
    expect(sent.method).toBe('connect');
    expect(sent.params.minProtocol).toBe(3);
    expect(sent.params.maxProtocol).toBe(3);
    expect(sent.params.client.id).toBe('gateway-client');
    expect(sent.params.auth).toEqual({ token: 'test-token' });
  });

  it('sendConnectFrame is idempotent (only sends once)', () => {
    const ws = createMockWs();
    (service as any).ws = ws;
    (service as any).token = 'test-token';

    (service as any).sendConnectFrame();
    (service as any).sendConnectFrame();

    expect(ws.send).toHaveBeenCalledTimes(1);
    expect((service as any).connectSent).toBe(true);
  });

  it('handleMessage sends connect frame on connect.challenge event', () => {
    const ws = createMockWs();
    (service as any).ws = ws;
    (service as any).token = 'test-token';
    (service as any).connectSent = false;

    (service as any).handleMessage(JSON.stringify({ type: 'event', event: 'connect.challenge' }));

    expect(ws.send).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(ws.send.mock.calls[0][0]);
    expect(sent.method).toBe('connect');
    expect(sent.params.minProtocol).toBe(3);
  });

  it('handleMessage sets connected=true on hello-ok response', () => {
    (service as any).connected = false;
    (service as any).connectSent = true;

    (service as any).handleMessage(
      JSON.stringify({ type: 'res', ok: true, id: 'connect-1', payload: { type: 'hello-ok' } }),
    );
    expect((service as any).connected).toBe(true);
  });

  it('handleMessage does NOT set connected on plain ok response (non hello-ok)', () => {
    (service as any).connected = false;
    (service as any).connectSent = true;

    (service as any).handleMessage(JSON.stringify({ type: 'res', ok: true, id: 'rpc-1' }));
    expect((service as any).connected).toBe(false);
  });

  it('handleMessage logs warning on error response', () => {
    (service as any).connected = false;
    (service as any).connectSent = true;

    (service as any).handleMessage(
      JSON.stringify({ type: 'res', ok: false, id: 'rpc-1', error: { code: 401, message: 'Unauthorized' } }),
    );

    expect((service as any).connected).toBe(false);
    expect((service as any).logger.warn).toHaveBeenCalled();
  });

  it('handleMessage sends connect on any event if connect not yet sent', () => {
    const ws = createMockWs();
    (service as any).ws = ws;
    (service as any).token = 'test-token';
    (service as any).connectSent = false;

    (service as any).handleMessage(JSON.stringify({ type: 'event', event: 'some.other.event' }));

    expect(ws.send).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(ws.send.mock.calls[0][0]);
    expect(sent.method).toBe('connect');
  });
});
