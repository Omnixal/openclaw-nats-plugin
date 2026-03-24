import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { GatewayClientService, GatewayRpcError } from './gateway-client.service';

/* ---------- helpers ---------- */

function createService(overrides: Record<string, string> = {}): GatewayClientService {
  const defaults: Record<string, string> = {
    'gateway.url': 'http://localhost:18789',
    'gateway.hookToken': 'test-hook-token',
  };
  const values = { ...defaults, ...overrides };

  const svc = new GatewayClientService() as any;
  svc.config = {
    get: mock((key: string) => values[key] ?? ''),
  };
  svc.logger = {
    info: mock(() => {}),
    warn: mock(() => {}),
    debug: mock(() => {}),
    error: mock(() => {}),
  };
  return svc as GatewayClientService;
}

function mockClient(postFn: any) {
  return { post: postFn };
}

/* ---------- tests ---------- */

describe('GatewayClientService', () => {
  it('isAlive() returns true when configured', async () => {
    const service = createService();
    await (service as any).onModuleInit();
    expect(service.isAlive()).toBe(true);
  });

  it('isAlive() returns false when hookToken is missing', async () => {
    const service = createService({ 'gateway.hookToken': '' });
    await (service as any).onModuleInit();
    expect(service.isAlive()).toBe(false);
  });

  it('inject() throws when not configured', async () => {
    const service = createService({ 'gateway.hookToken': '' });
    await (service as any).onModuleInit();
    await expect(service.inject({ message: 'hello' })).rejects.toThrow('Gateway webhook not configured');
  });

  it('inject() calls client.post with correct payload and resolves on success', async () => {
    const service = createService();
    await (service as any).onModuleInit();

    const postMock = mock(async () => ({ success: true, result: { ok: true } }));
    (service as any).client = mockClient(postMock);

    await service.inject({ message: '[NATS:agent.events.test] {"foo":"bar"}', eventId: 'evt-1' });

    expect(postMock).toHaveBeenCalledTimes(1);
    const [url, data] = postMock.mock.calls[0];
    expect(url).toBe('/hooks/wake');
    expect(data).toEqual({
      text: '[NATS:agent.events.test] {"foo":"bar"}',
      mode: 'now',
    });
  });

  it('inject() throws GatewayRpcError on error response', async () => {
    const service = createService();
    await (service as any).onModuleInit();

    const postMock = mock(async () => ({
      success: false,
      error: 'UNAUTHORIZED',
      code: 401,
      message: 'Unauthorized',
    }));
    (service as any).client = mockClient(postMock);

    try {
      await service.inject({ message: 'test' });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(GatewayRpcError);
      expect((err as GatewayRpcError).errorCode).toBe('401');
      expect((err as GatewayRpcError).errorMessage).toBe('Unauthorized');
    }
  });

  it('inject() throws GatewayRpcError on 500 error', async () => {
    const service = createService();
    await (service as any).onModuleInit();

    const postMock = mock(async () => ({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      code: 500,
      message: 'Internal Server Error',
    }));
    (service as any).client = mockClient(postMock);

    try {
      await service.inject({ message: 'test' });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(GatewayRpcError);
      expect((err as GatewayRpcError).errorCode).toBe('500');
    }
  });

  it('inject() increments requestId for each call', async () => {
    const service = createService();
    await (service as any).onModuleInit();

    const postMock = mock(async () => ({ success: true, result: {} }));
    (service as any).client = mockClient(postMock);

    await service.inject({ message: 'first' });
    await service.inject({ message: 'second' });

    expect((service as any).requestId).toBe(2);
  });

  it('onModuleInit creates HttpClient with correct options', async () => {
    const service = createService();
    await (service as any).onModuleInit();

    expect((service as any).client).toBeDefined();
    expect((service as any).configured).toBe(true);
  });
});
