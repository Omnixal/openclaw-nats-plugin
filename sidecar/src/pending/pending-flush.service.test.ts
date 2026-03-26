import { describe, it, expect, beforeEach, mock, afterEach } from 'bun:test';
import { PendingFlushService } from './pending-flush.service';
import { GatewayRpcError } from '../gateway/gateway-client.service';
import type { DbPendingEvent } from '../db/schema';

function makePendingEvent(overrides: Partial<DbPendingEvent> = {}): DbPendingEvent {
  return {
    id: 'pending-1',
    sessionKey: 'default',
    subject: 'agent.events.task.created',
    payload: { foo: 'bar' },
    priority: 5,
    createdAt: new Date(),
    deliveredAt: null,
    ...overrides,
  };
}

describe('PendingFlushService', () => {
  let service: PendingFlushService;
  let mockPendingService: any;
  let mockGatewayClient: any;
  let mockMetrics: any;
  let mockLogService: any;

  beforeEach(() => {
    mockPendingService = {
      fetchPending: mock(() => Promise.resolve([])),
      markDelivered: mock(() => Promise.resolve()),
    };
    mockGatewayClient = {
      isAlive: mock(() => true),
      inject: mock(() => Promise.resolve()),
    };
    mockMetrics = {
      recordConsume: mock(() => {}),
    };
    mockLogService = {
      logDelivery: mock(() => Promise.resolve()),
      logError: mock(() => Promise.resolve()),
    };

    service = new PendingFlushService(
      mockPendingService,
      mockGatewayClient,
      mockMetrics,
      mockLogService,
    );
    (service as any).logger = {
      debug: mock(() => {}),
      info: mock(() => {}),
      warn: mock(() => {}),
      error: mock(() => {}),
    };
    (service as any).config = {
      get: mock((key: string) => {
        if (key === 'pending.flushIntervalMs') return 30000;
        if (key === 'pending.flushBatchSize') return 10;
        return undefined;
      }),
    };
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  it('should skip flush when gateway is offline', async () => {
    mockGatewayClient.isAlive = mock(() => false);

    await service.flush();

    expect(mockGatewayClient.isAlive).toHaveBeenCalledTimes(1);
    expect(mockPendingService.fetchPending).not.toHaveBeenCalled();
  });

  it('should skip flush when no pending events', async () => {
    mockPendingService.fetchPending = mock(() => Promise.resolve([]));

    await service.flush();

    expect(mockPendingService.fetchPending).toHaveBeenCalledWith('default', 10);
    expect(mockGatewayClient.inject).not.toHaveBeenCalled();
  });

  it('should inject and mark delivered for each pending event', async () => {
    const events = [
      makePendingEvent({ id: 'p-1', subject: 'agent.events.a' }),
      makePendingEvent({ id: 'p-2', subject: 'agent.events.b' }),
    ];
    mockPendingService.fetchPending = mock(() => Promise.resolve(events));

    await service.flush();

    expect(mockGatewayClient.inject).toHaveBeenCalledTimes(2);
    expect(mockGatewayClient.inject.mock.calls[0][0]).toEqual({
      message: '[NATS:agent.events.a] {"foo":"bar"}',
      eventId: 'p-1',
    });
    expect(mockGatewayClient.inject.mock.calls[1][0]).toEqual({
      message: '[NATS:agent.events.b] {"foo":"bar"}',
      eventId: 'p-2',
    });

    expect(mockPendingService.markDelivered).toHaveBeenCalledTimes(2);
    expect(mockPendingService.markDelivered.mock.calls[0][0]).toEqual(['p-1']);
    expect(mockPendingService.markDelivered.mock.calls[1][0]).toEqual(['p-2']);

    expect(mockMetrics.recordConsume).toHaveBeenCalledTimes(2);
    expect(mockLogService.logDelivery).toHaveBeenCalledTimes(2);
  });

  it('should continue on GatewayRpcError and process remaining events', async () => {
    const events = [
      makePendingEvent({ id: 'p-1', subject: 'agent.events.a' }),
      makePendingEvent({ id: 'p-2', subject: 'agent.events.b' }),
      makePendingEvent({ id: 'p-3', subject: 'agent.events.c' }),
    ];
    mockPendingService.fetchPending = mock(() => Promise.resolve(events));
    mockGatewayClient.inject = mock((payload: any) => {
      if (payload.eventId === 'p-1') {
        return Promise.reject(new GatewayRpcError('rpc-1', 'SCOPE_ERROR', 'Missing scope'));
      }
      return Promise.resolve();
    });

    await service.flush();

    expect(mockGatewayClient.inject).toHaveBeenCalledTimes(3);
    // p-1 failed — not marked delivered
    expect(mockPendingService.markDelivered).toHaveBeenCalledTimes(2);
    expect(mockPendingService.markDelivered.mock.calls[0][0]).toEqual(['p-2']);
    expect(mockPendingService.markDelivered.mock.calls[1][0]).toEqual(['p-3']);
    expect(mockLogService.logError).toHaveBeenCalledTimes(1);
  });

  it('should break on network error and not process remaining events', async () => {
    const events = [
      makePendingEvent({ id: 'p-1', subject: 'agent.events.a' }),
      makePendingEvent({ id: 'p-2', subject: 'agent.events.b' }),
      makePendingEvent({ id: 'p-3', subject: 'agent.events.c' }),
    ];
    mockPendingService.fetchPending = mock(() => Promise.resolve(events));
    mockGatewayClient.inject = mock((payload: any) => {
      if (payload.eventId === 'p-2') {
        return Promise.reject(new Error('ECONNREFUSED'));
      }
      return Promise.resolve();
    });

    await service.flush();

    // p-1 succeeds, p-2 fails with network error, p-3 skipped
    expect(mockGatewayClient.inject).toHaveBeenCalledTimes(2);
    expect(mockPendingService.markDelivered).toHaveBeenCalledTimes(1);
    expect(mockPendingService.markDelivered.mock.calls[0][0]).toEqual(['p-1']);
    expect(mockLogService.logError).toHaveBeenCalledTimes(1);
  });

  it('should respect batch size limit', async () => {
    (service as any).config = {
      get: mock((key: string) => {
        if (key === 'pending.flushIntervalMs') return 30000;
        if (key === 'pending.flushBatchSize') return 2;
        return undefined;
      }),
    };

    await service.flush();

    expect(mockPendingService.fetchPending).toHaveBeenCalledWith('default', 2);
  });

  it('should start timer and run immediate flush on onModuleInit', async () => {
    const flushSpy = mock(() => Promise.resolve());
    (service as any).flush = flushSpy;

    await service.onModuleInit();

    expect(flushSpy).toHaveBeenCalledTimes(1);
    expect((service as any).flushTimer).toBeDefined();
  });

  it('should clear timer on onModuleDestroy', async () => {
    await service.onModuleInit();
    expect((service as any).flushTimer).toBeDefined();

    await service.onModuleDestroy();
    expect((service as any).flushTimer).toBeUndefined();
  });
});
