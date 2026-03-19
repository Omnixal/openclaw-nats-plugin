import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { HealthService } from './health.service';

describe('HealthService', () => {
  let service: HealthService;
  let mockAdapter: { isConnected: any };
  let queueService: any;
  let gateway: { isAlive: any };
  let pending: { countPending: any };

  const mockConfig = {
    get: (key: string) => {
      const values: Record<string, any> = {
        'nats.servers': 'nats://localhost:4222',
        'gateway.wsUrl': 'ws://localhost:18789',
        'consumer.name': 'openclaw-main',
        'dedup.ttlSeconds': 60,
      };
      return values[key];
    },
  };

  beforeEach(() => {
    mockAdapter = { isConnected: mock(() => true) };
    queueService = { getAdapter: mock(() => mockAdapter) };
    gateway = { isAlive: mock(() => true) };
    pending = { countPending: mock(() => Promise.resolve(0)) };

    service = new HealthService(queueService as any, gateway as any, pending as any);
    (service as any).config = mockConfig;
  });

  it('should return healthy status when NATS and Gateway both connected', async () => {
    const status = await service.getStatus();

    expect(status.nats.connected).toBe(true);
    expect(status.gateway.connected).toBe(true);
    expect(status.nats.url).toBe('nats://localhost:4222');
    expect(status.gateway.url).toBe('ws://localhost:18789');
  });

  it('should return degraded status when NATS disconnected', async () => {
    mockAdapter.isConnected.mockReturnValue(false);

    const status = await service.getStatus();

    expect(status.nats.connected).toBe(false);
    expect(status.gateway.connected).toBe(true);
  });

  it('should return degraded status when Gateway disconnected', async () => {
    gateway.isAlive.mockReturnValue(false);

    const status = await service.getStatus();

    expect(status.nats.connected).toBe(true);
    expect(status.gateway.connected).toBe(false);
  });

  it('should return false when adapter throws (not initialized)', async () => {
    queueService.getAdapter.mockImplementation(() => { throw new Error('not initialized'); });

    const status = await service.getStatus();

    expect(status.nats.connected).toBe(false);
  });

  it('should return correct pendingCount', async () => {
    pending.countPending.mockResolvedValue(42);

    const status = await service.getStatus();

    expect(status.pendingCount).toBe(42);
  });

  it('should return uptime in seconds', async () => {
    // The service was just created, so uptime should be 0 or very close
    const status = await service.getStatus();

    expect(status.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(status.uptimeSeconds).toBeLessThan(2);
  });

  it('should return config with streams, consumerName, dedupTtlSeconds', async () => {
    const status = await service.getStatus();

    expect(status.config).toEqual({
      streams: ['agent_events', 'agent_dlq'],
      consumerName: 'openclaw-main',
      dedupTtlSeconds: 60,
    });
  });
});
