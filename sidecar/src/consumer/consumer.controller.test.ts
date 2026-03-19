import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { ConsumerController } from './consumer.controller';
import type { NatsEventEnvelope } from '../publisher/envelope';
import type { Message } from '@onebun/core';

function makeEnvelope(overrides: Partial<NatsEventEnvelope> = {}): NatsEventEnvelope {
  return {
    id: 'evt-1',
    subject: 'agent.events.task.created',
    timestamp: new Date().toISOString(),
    source: 'test',
    payload: { foo: 'bar' },
    meta: { priority: 5 },
    ...overrides,
  };
}

function makeMockMessage(envelope: NatsEventEnvelope): Message<NatsEventEnvelope> {
  return {
    id: 'msg-1',
    pattern: envelope.subject,
    data: envelope,
    timestamp: Date.now(),
    redelivered: false,
    metadata: {},
    ack: mock(() => Promise.resolve()),
    nack: mock(() => Promise.resolve()),
  };
}

function makeDefaultRoute(target: string = 'main') {
  return { id: 'route-1', pattern: 'agent.events.>', target, enabled: true, priority: 5, createdAt: new Date() };
}

describe('ConsumerController', () => {
  let service: ConsumerController;
  let mockPipeline: any;
  let mockGatewayClient: any;
  let mockPendingService: any;
  let mockRouterService: any;

  beforeEach(() => {
    mockPipeline = {
      process: mock(() =>
        Promise.resolve({ result: 'pass' as const, ctx: { enrichments: { priority: 5 } } }),
      ),
    };
    mockGatewayClient = {
      isAlive: mock(() => true),
      inject: mock(() => Promise.resolve()),
    };
    mockPendingService = {
      addPending: mock(() => Promise.resolve()),
    };
    mockRouterService = {
      findMatchingRoutes: mock(() => Promise.resolve([makeDefaultRoute()])),
    };

    service = new ConsumerController(mockPipeline, mockGatewayClient, mockPendingService, mockRouterService);
    (service as any).logger = {
      debug: mock(() => {}),
      info: mock(() => {}),
      warn: mock(() => {}),
      error: mock(() => {}),
    };
    (service as any).config = {
      get: mock((key: string) => {
        if (key === 'consumer.name') return 'sidecar-consumer';
        return undefined;
      }),
    };
  });

  it('should ack and inject to gateway when pipeline passes and gateway is alive', async () => {
    const envelope = makeEnvelope();
    const msg = makeMockMessage(envelope);

    await (service as any).handleInbound(msg);

    expect(mockPipeline.process).toHaveBeenCalledTimes(1);
    expect(mockRouterService.findMatchingRoutes).toHaveBeenCalledTimes(1);
    expect(mockGatewayClient.isAlive).toHaveBeenCalledTimes(1);
    expect(mockGatewayClient.inject).toHaveBeenCalledTimes(1);

    const injectCall = mockGatewayClient.inject.mock.calls[0][0];
    expect(injectCall.target).toBe('main');
    expect(injectCall.message).toBe(`[NATS:${envelope.subject}] ${JSON.stringify(envelope.payload)}`);
    expect(injectCall.metadata.source).toBe('nats');
    expect(injectCall.metadata.eventId).toBe(envelope.id);
    expect(injectCall.metadata.subject).toBe(envelope.subject);
    expect(injectCall.metadata.priority).toBe(5);

    expect(msg.ack).toHaveBeenCalledTimes(1);
    expect(msg.nack).not.toHaveBeenCalled();
  });

  it('should ack without calling gateway when pipeline returns drop', async () => {
    mockPipeline.process = mock(() =>
      Promise.resolve({ result: 'drop' as const, ctx: { enrichments: {} } }),
    );

    const envelope = makeEnvelope();
    const msg = makeMockMessage(envelope);

    await (service as any).handleInbound(msg);

    expect(msg.ack).toHaveBeenCalledTimes(1);
    expect(mockGatewayClient.inject).not.toHaveBeenCalled();
    expect(mockGatewayClient.isAlive).not.toHaveBeenCalled();
    expect(msg.nack).not.toHaveBeenCalled();
  });

  it('should ack without calling gateway when no routes match', async () => {
    mockRouterService.findMatchingRoutes = mock(() => Promise.resolve([]));

    const envelope = makeEnvelope();
    const msg = makeMockMessage(envelope);

    await (service as any).handleInbound(msg);

    expect(msg.ack).toHaveBeenCalledTimes(1);
    expect(mockGatewayClient.inject).not.toHaveBeenCalled();
    expect(mockGatewayClient.isAlive).not.toHaveBeenCalled();
    expect(msg.nack).not.toHaveBeenCalled();
  });

  it('should store pending and ack when pipeline passes but gateway is not alive', async () => {
    mockGatewayClient.isAlive = mock(() => false);

    const envelope = makeEnvelope();
    const msg = makeMockMessage(envelope);

    await (service as any).handleInbound(msg);

    expect(mockPendingService.addPending).toHaveBeenCalledTimes(1);
    expect(msg.ack).toHaveBeenCalledTimes(1);
    expect(msg.nack).not.toHaveBeenCalled();
    expect(mockGatewayClient.inject).not.toHaveBeenCalled();
  });

  it('should nack when pipeline throws an error', async () => {
    mockPipeline.process = mock(() => Promise.reject(new Error('pipeline boom')));

    const envelope = makeEnvelope();
    const msg = makeMockMessage(envelope);

    await (service as any).handleInbound(msg);

    expect(msg.nack).toHaveBeenCalledTimes(1);
    expect(msg.ack).not.toHaveBeenCalled();
  });

  it('should nack when message contains unextractable data', async () => {
    const msg: Message<unknown> = {
      id: 'msg-1',
      pattern: 'agent.events.test',
      data: 12345, // not an envelope, not a string
      timestamp: Date.now(),
      redelivered: false,
      metadata: {},
      ack: mock(() => Promise.resolve()),
      nack: mock(() => Promise.resolve()),
    };

    await (service as any).handleInbound(msg);

    expect(msg.nack).toHaveBeenCalledTimes(1);
    expect(msg.ack).not.toHaveBeenCalled();
  });

  it('should format message as [NATS:subject] payload', () => {
    const envelope = makeEnvelope({
      subject: 'agent.events.order.placed',
      payload: { orderId: 123 },
    });

    const result = (service as any).formatMessage(envelope);

    expect(result).toBe('[NATS:agent.events.order.placed] {"orderId":123}');
  });

  it('should use target from matching route', async () => {
    mockRouterService.findMatchingRoutes = mock(() =>
      Promise.resolve([makeDefaultRoute('worker-2')]),
    );

    const envelope = makeEnvelope();
    const msg = makeMockMessage(envelope);

    await (service as any).handleInbound(msg);

    const injectCall = mockGatewayClient.inject.mock.calls[0][0];
    expect(injectCall.target).toBe('worker-2');
  });

  it('should deliver to multiple matching routes', async () => {
    mockRouterService.findMatchingRoutes = mock(() =>
      Promise.resolve([makeDefaultRoute('main'), makeDefaultRoute('worker-2')]),
    );

    const envelope = makeEnvelope();
    const msg = makeMockMessage(envelope);

    await (service as any).handleInbound(msg);

    expect(mockGatewayClient.inject).toHaveBeenCalledTimes(2);
    expect(mockGatewayClient.inject.mock.calls[0][0].target).toBe('main');
    expect(mockGatewayClient.inject.mock.calls[1][0].target).toBe('worker-2');
  });

  it('should use priority from pipeline context enrichments', async () => {
    mockPipeline.process = mock(() =>
      Promise.resolve({ result: 'pass' as const, ctx: { enrichments: { priority: 8 } } }),
    );

    const envelope = makeEnvelope();
    const msg = makeMockMessage(envelope);

    await (service as any).handleInbound(msg);

    const injectCall = mockGatewayClient.inject.mock.calls[0][0];
    expect(injectCall.metadata.priority).toBe(8);
  });

  it('should fall back to envelope meta priority when enrichment has no priority', async () => {
    mockPipeline.process = mock(() =>
      Promise.resolve({ result: 'pass' as const, ctx: { enrichments: {} } }),
    );

    const envelope = makeEnvelope({ meta: { priority: 3 } });
    const msg = makeMockMessage(envelope);

    await (service as any).handleInbound(msg);

    const injectCall = mockGatewayClient.inject.mock.calls[0][0];
    expect(injectCall.metadata.priority).toBe(3);
  });

  it('should default priority to 5 when neither enrichment nor meta has it', async () => {
    mockPipeline.process = mock(() =>
      Promise.resolve({ result: 'pass' as const, ctx: { enrichments: {} } }),
    );

    const envelope = makeEnvelope({ meta: undefined });
    const msg = makeMockMessage(envelope);

    await (service as any).handleInbound(msg);

    const injectCall = mockGatewayClient.inject.mock.calls[0][0];
    expect(injectCall.metadata.priority).toBe(5);
  });

  it('should handle string message data by parsing as JSON', async () => {
    const envelope = makeEnvelope();
    const msg: Message<unknown> = {
      id: 'msg-1',
      pattern: 'agent.events.test',
      data: JSON.stringify(envelope), // string data
      timestamp: Date.now(),
      redelivered: false,
      metadata: {},
      ack: mock(() => Promise.resolve()),
      nack: mock(() => Promise.resolve()),
    };

    await (service as any).handleInbound(msg);

    expect(msg.ack).toHaveBeenCalledTimes(1);
    expect(mockGatewayClient.inject).toHaveBeenCalledTimes(1);
  });
});
