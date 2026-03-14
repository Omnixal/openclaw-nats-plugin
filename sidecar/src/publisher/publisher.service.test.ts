import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { PublisherService } from './publisher.service';
import { createEnvelope } from './envelope';

describe('PublisherService', () => {
  let service: PublisherService;
  let mockPublish: ReturnType<typeof mock>;
  let mockQueueService: any;

  beforeEach(() => {
    mockPublish = mock(() => Promise.resolve('msg-id-1'));
    mockQueueService = {
      publish: mockPublish,
      isConnected: () => true,
    };
    service = new PublisherService(mockQueueService);
    (service as any).logger = {
      debug: mock(() => {}),
      info: mock(() => {}),
      warn: mock(() => {}),
      error: mock(() => {}),
    };
  });

  it('should publish envelope via QueueService with correct subject', async () => {
    await service.publish('agent.events.test', { foo: 'bar' });

    expect(mockPublish).toHaveBeenCalledTimes(1);
    const [subject, envelope] = mockPublish.mock.calls[0];
    expect(subject).toBe('agent.events.test');
    expect(envelope.subject).toBe('agent.events.test');
    expect(envelope.payload).toEqual({ foo: 'bar' });
  });

  it('should create envelope with ULID id', async () => {
    await service.publish('agent.events.test', {});

    const [, envelope] = mockPublish.mock.calls[0];
    // ULID is 26 chars, uppercase alphanumeric
    expect(envelope.id).toMatch(/^[0-9A-Z]{26}$/);
  });

  it('should create envelope with ISO timestamp', async () => {
    await service.publish('agent.events.test', {});

    const [, envelope] = mockPublish.mock.calls[0];
    // ISO 8601 format check
    expect(new Date(envelope.timestamp).toISOString()).toBe(envelope.timestamp);
  });

  it('should set source to openclaw-plugin', async () => {
    await service.publish('agent.events.test', {});

    const [, envelope] = mockPublish.mock.calls[0];
    expect(envelope.source).toBe('openclaw-plugin');
  });

  it('should set default priority to 5 when no meta provided', async () => {
    await service.publish('agent.events.test', {});

    const [, envelope] = mockPublish.mock.calls[0];
    expect(envelope.meta).toEqual({ priority: 5 });
  });

  it('should pass meta through with default priority', async () => {
    await service.publish('agent.events.test', {}, { traceId: 'trace-123' });

    const [, envelope] = mockPublish.mock.calls[0];
    expect(envelope.meta).toEqual({ priority: 5, traceId: 'trace-123' });
  });

  it('should respect custom priority in meta', async () => {
    await service.publish('agent.events.test', {}, { priority: 1 });

    const [, envelope] = mockPublish.mock.calls[0];
    expect(envelope.meta.priority).toBe(1);
  });
});

describe('createEnvelope', () => {
  it('should create envelope with all fields', () => {
    const envelope = createEnvelope('agent.events.test', { key: 'value' }, { traceId: 'abc' }, {
      sessionKey: 'sess-1',
      agentTarget: 'target-1',
      source: 'custom-source',
    });

    expect(envelope.id).toMatch(/^[0-9A-Z]{26}$/);
    expect(envelope.subject).toBe('agent.events.test');
    expect(envelope.source).toBe('custom-source');
    expect(envelope.sessionKey).toBe('sess-1');
    expect(envelope.agentTarget).toBe('target-1');
    expect(envelope.payload).toEqual({ key: 'value' });
    expect(envelope.meta).toEqual({ priority: 5, traceId: 'abc' });
  });

  it('should use default source when not provided', () => {
    const envelope = createEnvelope('test', {});
    expect(envelope.source).toBe('openclaw-plugin');
  });
});
