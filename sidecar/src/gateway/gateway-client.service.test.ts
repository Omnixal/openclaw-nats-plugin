import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { GatewayClientService, GatewayRpcError } from './gateway-client.service';
import { generateIdentity, publicKeyToBase64Url } from './device-identity';

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

const testIdentity = generateIdentity();
const testPublicKeyBase64Url = publicKeyToBase64Url(testIdentity.publicKeyPem);

function createService(): GatewayClientService {
  const svc = new GatewayClientService() as any;
  svc.config = {
    get: mock((key: string) => {
      if (key === 'gateway.wsUrl') return 'ws://localhost:18789';
      if (key === 'gateway.token') return 'test-token';
      if (key === 'database.url') return './data/test.db';
      return '';
    }),
  };
  svc.logger = {
    info: mock(() => {}),
    warn: mock(() => {}),
    debug: mock(() => {}),
    error: mock(() => {}),
  };
  // Inject test identity (skip file I/O)
  svc.identity = testIdentity;
  svc.publicKeyBase64Url = testPublicKeyBase64Url;
  svc.token = 'test-token';
  svc.challengeNonce = '';
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

  it('inject() sends correct frame and resolves on ok response', async () => {
    const ws = createMockWs();
    (service as any).ws = ws;
    (service as any).connected = true;
    (service as any).requestId = 10;

    const promise = service.inject({
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

    // Simulate gateway ok response
    (service as any).handleMessage(JSON.stringify({ type: 'res', ok: true, id: 'rpc-11' }));
    await promise; // should resolve without error
  });

  it('inject() rejects with GatewayRpcError on error response', async () => {
    const ws = createMockWs();
    (service as any).ws = ws;
    (service as any).connected = true;
    (service as any).requestId = 5;

    const promise = service.inject({ target: 'main', message: 'test' });

    (service as any).handleMessage(
      JSON.stringify({
        type: 'res',
        ok: false,
        id: 'rpc-6',
        error: { errorCode: 'INVALID_REQUEST', errorMessage: 'missing scope: operator.write' },
      }),
    );

    await expect(promise).rejects.toThrow(GatewayRpcError);
    await expect(promise).rejects.toThrow('missing scope: operator.write');
  });

  it('inject() uses requestId as idempotencyKey when metadata.eventId is absent', async () => {
    const ws = createMockWs();
    (service as any).ws = ws;
    (service as any).connected = true;
    (service as any).requestId = 5;

    const promise = service.inject({ target: 'main', message: 'no-meta' });

    const sent = JSON.parse(ws.send.mock.calls[0][0]);
    expect(sent.params.idempotencyKey).toBe('6');

    (service as any).handleMessage(JSON.stringify({ type: 'res', ok: true, id: 'rpc-6' }));
    await promise;
  });

  it('inject() rejects when WebSocket closes before response', async () => {
    const ws = createMockWs();
    (service as any).ws = ws;
    (service as any).connected = true;
    (service as any).requestId = 0;

    const promise = service.inject({ target: 'main', message: 'test' });

    (service as any).connected = false;
    (service as any).connectSent = false;
    for (const [id, pending] of (service as any).pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Gateway WebSocket closed'));
    }
    (service as any).pendingRequests.clear();

    await expect(promise).rejects.toThrow('Gateway WebSocket closed');
  });

  it('onModuleDestroy() closes WebSocket and rejects pending requests', async () => {
    const ws = createMockWs();
    (service as any).ws = ws;
    (service as any).connected = true;
    (service as any).connectSent = true;
    (service as any).reconnectTimer = setTimeout(() => {}, 99999);
    (service as any).requestId = 0;

    const promise = service.inject({ target: 'main', message: 'test' });

    await (service as any).onModuleDestroy();

    expect(ws.close).toHaveBeenCalledTimes(1);
    expect((service as any).ws).toBeNull();
    expect((service as any).connected).toBe(false);
    expect((service as any).connectSent).toBe(false);
    expect((service as any).reconnectTimer).toBeNull();
    expect((service as any).pendingRequests.size).toBe(0);

    await expect(promise).rejects.toThrow('Gateway client shutting down');
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

    const timer = (service as any).reconnectTimer;
    (service as any).scheduleReconnect();
    expect((service as any).reconnectTimer).toBe(timer);
    expect((service as any).reconnectAttempt).toBe(2);
  });

  // --- Handshake protocol ---

  it('sendConnectFrame includes device identity block with signature', () => {
    const ws = createMockWs();
    (service as any).ws = ws;
    (service as any).requestId = 0;
    (service as any).challengeNonce = 'test-nonce-abc';

    (service as any).sendConnectFrame();

    expect(ws.send).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(ws.send.mock.calls[0][0]);
    expect(sent.type).toBe('req');
    expect(sent.id).toBe('connect-1');
    expect(sent.method).toBe('connect');
    expect(sent.params.minProtocol).toBe(3);
    expect(sent.params.maxProtocol).toBe(3);
    expect(sent.params.client.id).toBe('gateway-client');
    expect(sent.params.client.mode).toBe('backend');
    expect(sent.params.auth).toEqual({ token: 'test-token' });
    expect(sent.params.scopes).toEqual(['operator.read', 'operator.write']);

    // Device identity block
    expect(sent.params.device).toBeDefined();
    expect(sent.params.device.id).toBe(testIdentity.deviceId);
    expect(sent.params.device.publicKey).toBe(testPublicKeyBase64Url);
    expect(sent.params.device.nonce).toBe('test-nonce-abc');
    expect(typeof sent.params.device.signedAt).toBe('number');
    expect(sent.params.device.signature).toMatch(/^[A-Za-z0-9_-]+$/); // base64url
  });

  it('sendConnectFrame is idempotent (only sends once)', () => {
    const ws = createMockWs();
    (service as any).ws = ws;

    (service as any).sendConnectFrame();
    (service as any).sendConnectFrame();

    expect(ws.send).toHaveBeenCalledTimes(1);
    expect((service as any).connectSent).toBe(true);
  });

  it('handleMessage saves nonce from connect.challenge and sends connect frame', () => {
    const ws = createMockWs();
    (service as any).ws = ws;
    (service as any).connectSent = false;

    (service as any).handleMessage(
      JSON.stringify({ type: 'event', event: 'connect.challenge', payload: { nonce: 'server-nonce-xyz', ts: Date.now() } }),
    );

    expect((service as any).challengeNonce).toBe('server-nonce-xyz');
    expect(ws.send).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(ws.send.mock.calls[0][0]);
    expect(sent.method).toBe('connect');
    expect(sent.params.device.nonce).toBe('server-nonce-xyz');
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

  it('handleMessage logs error and rejects pending on error response', () => {
    (service as any).connected = false;
    (service as any).connectSent = true;

    let rejected: Error | null = null;
    const timer = setTimeout(() => {}, 99999);
    (service as any).pendingRequests.set('rpc-1', {
      resolve: () => {},
      reject: (err: Error) => { rejected = err; },
      timer,
    });

    (service as any).handleMessage(
      JSON.stringify({ type: 'res', ok: false, id: 'rpc-1', error: { code: 401, message: 'Unauthorized' } }),
    );

    expect((service as any).connected).toBe(false);
    expect((service as any).logger.error).toHaveBeenCalled();
    expect(rejected).toBeInstanceOf(GatewayRpcError);
    expect((rejected as any).errorCode).toBe('401');
    expect((rejected as any).errorMessage).toBe('Unauthorized');
    expect((service as any).pendingRequests.size).toBe(0);
  });

  it('handleMessage closes and reconnects on connect error response', () => {
    const ws = createMockWs();
    (service as any).ws = ws;
    (service as any).connected = true;
    (service as any).connectSent = true;

    (service as any).handleMessage(
      JSON.stringify({
        type: 'res',
        ok: false,
        id: 'connect-1',
        error: { errorCode: 'AUTH_FAILED', errorMessage: 'Invalid token' },
      }),
    );

    expect((service as any).connected).toBe(false);
    expect((service as any).connectSent).toBe(false);
    expect(ws.close).toHaveBeenCalledTimes(1);
    expect((service as any).logger.error).toHaveBeenCalled();
  });

  it('handleMessage sends connect on any event if connect not yet sent', () => {
    const ws = createMockWs();
    (service as any).ws = ws;
    (service as any).connectSent = false;

    (service as any).handleMessage(JSON.stringify({ type: 'event', event: 'some.other.event' }));

    expect(ws.send).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(ws.send.mock.calls[0][0]);
    expect(sent.method).toBe('connect');
  });
});
