import { Service, BaseService, type OnModuleInit, type OnModuleDestroy } from '@onebun/core';
import { DedupRepository } from './dedup.repository';

@Service()
export class DedupService extends BaseService implements OnModuleInit, OnModuleDestroy {
  private ttlSeconds!: number;
  private cleanupTimer?: ReturnType<typeof setInterval>;

  constructor(private repo: DedupRepository) {
    super();
  }

  async onModuleInit(): Promise<void> {
    this.ttlSeconds = this.config.get('dedup.ttlSeconds');
    const cleanupIntervalMs = this.config.get('dedup.cleanupIntervalMs');

    await this.cleanup();
    this.cleanupTimer = setInterval(() => this.cleanup(), cleanupIntervalMs);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  async isDuplicate(eventId: string, subject: string): Promise<boolean> {
    const duplicate = await this.repo.isDuplicate(eventId);
    if (duplicate) return true;
    await this.repo.markSeen(eventId, subject);
    return false;
  }

  async cleanup(): Promise<number> {
    return this.repo.cleanup(this.ttlSeconds);
  }
}
