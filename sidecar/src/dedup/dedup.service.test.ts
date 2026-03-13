import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import { DedupService } from './dedup.service';

describe('DedupService', () => {
  let service: DedupService;
  let repo: { isDuplicate: any; markSeen: any; cleanup: any };

  beforeEach(() => {
    repo = {
      isDuplicate: mock(() => Promise.resolve(false)),
      markSeen: mock(() => Promise.resolve()),
      cleanup: mock(() => Promise.resolve(3)),
    };
    service = new DedupService(repo as any);
    (service as any).ttlSeconds = 60;
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  it('should return false for new event', async () => {
    const result = await service.isDuplicate('evt-1', 'agent.inbound.task.created');
    expect(result).toBe(false);
    expect(repo.markSeen).toHaveBeenCalledWith('evt-1', 'agent.inbound.task.created');
  });

  it('should return true for seen event', async () => {
    repo.isDuplicate.mockImplementation(() => Promise.resolve(true));
    const result = await service.isDuplicate('evt-1', 'agent.inbound.task.created');
    expect(result).toBe(true);
    expect(repo.markSeen).not.toHaveBeenCalled();
  });

  it('should cleanup old entries', async () => {
    const deleted = await service.cleanup();
    expect(deleted).toBe(3);
    expect(repo.cleanup).toHaveBeenCalled();
  });

  it('should start a periodic cleanup timer on init', async () => {
    const configGet = mock((key: string) => {
      if (key === 'dedup.ttlSeconds') return 120;
      if (key === 'dedup.cleanupIntervalMs') return 60_000;
      return undefined;
    });
    (service as any).config = { get: configGet };

    await service.onModuleInit();

    // Timer should be set (cleanup runs on interval, not immediately)
    expect((service as any).cleanupTimer).toBeDefined();
  });

  it('should clear timer on destroy', async () => {
    const configGet = mock((key: string) => {
      if (key === 'dedup.ttlSeconds') return 60;
      if (key === 'dedup.cleanupIntervalMs') return 60_000;
      return undefined;
    });
    (service as any).config = { get: configGet };

    await service.onModuleInit();
    expect((service as any).cleanupTimer).toBeDefined();

    await service.onModuleDestroy();
    expect((service as any).cleanupTimer).toBeUndefined();
  });
});
