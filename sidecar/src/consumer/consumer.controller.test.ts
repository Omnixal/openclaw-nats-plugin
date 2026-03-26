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
  return { id: 'route-1', name: 'agent.events.>', pattern: 'agent.events.>', target, enabled: true, priority: 5, filter: null, filterDropCount: 0, createdAt: new Date() };
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
      recordDelivery: mock(() => Promise.resolve()),
    };

    const mockMetrics = { recordPublish: mock(() => {}), recordConsume: mock(() => {}), getAll: mock(() => []) };
    const mockLogService = { logDelivery: mock(() => Promise.resolve()), logError: mock(() => Promise.resolve()), logCronFire: mock(() => Promise.resolve()) };
    const mockRouteFilter = { evaluate: mock(() => true) };
    service = new ConsumerController(mockPipeline, mockGatewayClient, mockPendingService, mockRouterService, mockMetrics as any, mockLogService as any, mockRouteFilter as any);
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
    expect(injectCall.message).toContain(`[NATS:${envelope.subject}]`);
    // Composed payload includes event data + _delivery metadata
    const msgPayload = JSON.parse(injectCall.message.replace(`[NATS:${envelope.subject}] `, ''));
    expect(msgPayload.foo).toBe('bar');
    expect(msgPayload._delivery).toBeDefined();
    expect(msgPayload._delivery.pattern).toBe('agent.events.>');
    expect(msgPayload._delivery.source).toBe('external');
    expect(msgPayload._delivery.eventSubject).toBe(envelope.subject);
    expect(msgPayload._delivery.eventId).toBe(envelope.id);
    expect(injectCall.eventId).toBe(envelope.id);

    expect(mockRouterService.recordDelivery).toHaveBeenCalledTimes(1);
    const recordArgs = mockRouterService.recordDelivery.mock.calls[0];
    expect(recordArgs[0]).toBe('route-1');
    expect(recordArgs[1]).toBe(envelope.subject);
    expect(typeof recordArgs[2]).toBe('number');
    expect(recordArgs[2]).toBeGreaterThanOrEqual(0);

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

  it('should format message as [NATS:subject] composedPayload', () => {
    const composedPayload = { orderId: 123, _delivery: { pattern: 'agent.events.>', source: 'external' } };
    const result = (service as any).formatMessage('agent.events.order.placed', composedPayload);

    expect(result).toBe(`[NATS:agent.events.order.placed] ${JSON.stringify(composedPayload)}`);
  });

  it('should compose payload with _delivery metadata and custom payload', () => {
    const envelope = makeEnvelope({
      subject: 'agent.events.order.placed',
      payload: { orderId: 123 },
    });
    const route = { ...makeDefaultRoute(), customPayload: { context: 'my-context' } };

    const result = (service as any).composePayload(envelope, route);

    expect(result.orderId).toBe(123);
    expect(result.context).toBe('my-context');
    expect(result._delivery.pattern).toBe('agent.events.>');
    expect(result._delivery.source).toBe('external');
    expect(result._delivery.eventSubject).toBe('agent.events.order.placed');
    expect(result._delivery.eventId).toBe(envelope.id);
  });

  it('should detect cron source from _cron in payload', () => {
    const envelope = makeEnvelope({
      payload: { _cron: { jobName: 'daily' } },
    });
    const route = makeDefaultRoute();

    const result = (service as any).composePayload(envelope, route);
    expect(result._delivery.source).toBe('cron');
  });

  it('should detect timer source from _timer in payload', () => {
    const envelope = makeEnvelope({
      payload: { _timer: { name: 'check' } },
    });
    const route = makeDefaultRoute();

    const result = (service as any).composePayload(envelope, route);
    expect(result._delivery.source).toBe('timer');
  });

  it('should deliver to multiple matching routes', async () => {
    mockRouterService.findMatchingRoutes = mock(() =>
      Promise.resolve([makeDefaultRoute('main'), makeDefaultRoute('worker-2')]),
    );

    const envelope = makeEnvelope();
    const msg = makeMockMessage(envelope);

    await (service as any).handleInbound(msg);

    expect(mockGatewayClient.inject).toHaveBeenCalledTimes(2);
    expect(mockGatewayClient.inject.mock.calls[0][0].message).toContain(envelope.subject);
    expect(mockGatewayClient.inject.mock.calls[1][0].message).toContain(envelope.subject);
  });

  it('should include eventId in inject payload', async () => {
    const envelope = makeEnvelope();
    const msg = makeMockMessage(envelope);

    await (service as any).handleInbound(msg);

    const injectCall = mockGatewayClient.inject.mock.calls[0][0];
    expect(injectCall.eventId).toBe(envelope.id);
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
