import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { ConsumerController } from './consumer.controller';
import type { NatsEventEnvelope } from '../publisher/envelope';
import type { Message } from '@onebun/core';

function makeEnvelope(overrides: Partial<NatsEventEnvelope> = {}): NatsEventEnvelope {
  return {
    id: 'evt-1',
    subject: 'agent.inbound.task.created',
    timestamp: new Date().toISOString(),
    source: 'test',
    payload: { foo: 'bar' },
    meta: { priority: 5 },
    ...overrides,
  };
}

/**
 * Create a mock Message<T> as provided by the JetStreamQueueAdapter.
 * The adapter parses the JSON and puts parsed data in message.data.
 * Our PublisherService publishes NatsEventEnvelope as the data field,
 * so message.data will be the envelope itself.
 */
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

describe('ConsumerController', () => {
  let service: ConsumerController;
  let mockPipeline: any;
  let mockGatewayClient: any;
  let mockPendingService: any;

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

    service = new ConsumerController(mockPipeline, mockGatewayClient, mockPendingService);
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
      pattern: 'agent.inbound.test',
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
      subject: 'agent.inbound.order.placed',
      payload: { orderId: 123 },
    });

    const result = (service as any).formatMessage(envelope);

    expect(result).toBe('[NATS:agent.inbound.order.placed] {"orderId":123}');
  });

  it('should use agentTarget from envelope when present', async () => {
    const envelope = makeEnvelope({ agentTarget: 'worker-2' });
    const msg = makeMockMessage(envelope);

    await (service as any).handleInbound(msg);

    const injectCall = mockGatewayClient.inject.mock.calls[0][0];
    expect(injectCall.target).toBe('worker-2');
  });

  it('should default agentTarget to main when not in envelope', async () => {
    const envelope = makeEnvelope({ agentTarget: undefined });
    const msg = makeMockMessage(envelope);

    await (service as any).handleInbound(msg);

    const injectCall = mockGatewayClient.inject.mock.calls[0][0];
    expect(injectCall.target).toBe('main');
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
      pattern: 'agent.inbound.test',
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
