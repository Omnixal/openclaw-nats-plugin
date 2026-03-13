import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { PendingService } from './pending.service';
import type { NatsEventEnvelope } from '../publisher/envelope';

describe('PendingService', () => {
  let service: PendingService;
  let repo: { addPending: any; fetchPending: any; markDelivered: any; cleanup: any };

  beforeEach(() => {
    repo = {
      addPending: mock(() => Promise.resolve()),
      fetchPending: mock(() => Promise.resolve([])),
      markDelivered: mock(() => Promise.resolve()),
      cleanup: mock(() => Promise.resolve(5)),
    };
    service = new PendingService(repo as any);
    (service as any).config = { get: (key: string) => (key === 'dedup.ttlSeconds' ? 120 : undefined) };
  });

  it('should extract correct fields from envelope', async () => {
    const envelope: NatsEventEnvelope = {
      id: 'evt-1',
      subject: 'agent.inbound.task.created',
      timestamp: new Date().toISOString(),
      source: 'test',
      sessionKey: 'session-abc',
      payload: { foo: 'bar' },
      meta: { priority: 3 },
    };

    await service.addPending(envelope);

    expect(repo.addPending).toHaveBeenCalledWith({
      id: 'evt-1',
      sessionKey: 'session-abc',
      subject: 'agent.inbound.task.created',
      payload: { foo: 'bar' },
      priority: 3,
    });
  });

  it('should use "default" when sessionKey is undefined', async () => {
    const envelope: NatsEventEnvelope = {
      id: 'evt-2',
      subject: 'agent.inbound.notify',
      timestamp: new Date().toISOString(),
      source: 'test',
      payload: null,
    };

    await service.addPending(envelope);

    expect(repo.addPending).toHaveBeenCalledWith({
      id: 'evt-2',
      sessionKey: 'default',
      subject: 'agent.inbound.notify',
      payload: null,
      priority: 5,
    });
  });

  it('should use priority from meta, defaults to 5', async () => {
    const envelope: NatsEventEnvelope = {
      id: 'evt-3',
      subject: 'agent.inbound.task',
      timestamp: new Date().toISOString(),
      source: 'test',
      payload: {},
      meta: { traceId: 'abc' }, // no priority in meta
    };

    await service.addPending(envelope);

    expect(repo.addPending).toHaveBeenCalledWith({
      id: 'evt-3',
      sessionKey: 'default',
      subject: 'agent.inbound.task',
      payload: {},
      priority: 5,
    });
  });

  it('should delegate fetchPending to repo', async () => {
    const fakeEvents = [{ id: 'evt-1', sessionKey: 'session-abc', subject: 'test', priority: 5, payload: null, createdAt: new Date(), deliveredAt: null }];
    repo.fetchPending.mockImplementation(() => Promise.resolve(fakeEvents));

    const result = await service.fetchPending('session-abc');

    expect(result).toEqual(fakeEvents);
    expect(repo.fetchPending).toHaveBeenCalledWith('session-abc');
  });

  it('should delegate markDelivered to repo', async () => {
    await service.markDelivered(['evt-1', 'evt-2']);
    expect(repo.markDelivered).toHaveBeenCalledWith(['evt-1', 'evt-2']);
  });

  it('should delegate cleanup to repo with configured TTL', async () => {
    const deleted = await service.cleanup();
    expect(deleted).toBe(5);
    expect(repo.cleanup).toHaveBeenCalledWith(120);
  });
});
