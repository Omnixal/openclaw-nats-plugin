import { Service, BaseService } from '@onebun/core';
import { PendingRepository } from './pending.repository';
import type { NatsEventEnvelope } from '../publisher/envelope';
import type { DbPendingEvent } from '../db/schema';

@Service()
export class PendingService extends BaseService {
  constructor(private repo: PendingRepository) {
    super();
  }

  async addPending(envelope: NatsEventEnvelope): Promise<void> {
    await this.repo.addPending({
      id: envelope.id,
      sessionKey: envelope.sessionKey ?? 'default',
      subject: envelope.subject,
      payload: envelope.payload,
      priority: envelope.meta?.priority ?? 5,
    });
  }

  async fetchPending(sessionKey: string, limit?: number): Promise<DbPendingEvent[]> {
    return this.repo.fetchPending(sessionKey, limit);
  }

  async markDelivered(ids: string[]): Promise<void> {
    return this.repo.markDelivered(ids);
  }

  async countPending(): Promise<number> {
    return this.repo.countPending();
  }

  async cleanup(): Promise<number> {
    const ttl = this.config.get('dedup.ttlSeconds');
    return this.repo.cleanup(ttl);
  }
}
