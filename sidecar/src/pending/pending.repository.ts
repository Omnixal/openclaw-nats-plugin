import { Service, BaseService } from '@onebun/core';
import { DrizzleService, eq, and, isNull, inArray, lt, desc, sql } from '@onebun/drizzle';
import { pendingEvents, type DbPendingEvent } from '../db/schema';

@Service()
export class PendingRepository extends BaseService {
  constructor(private db: DrizzleService) {
    super();
  }

  async addPending(event: {
    id: string;
    sessionKey: string;
    subject: string;
    payload: unknown;
    priority: number;
  }): Promise<void> {
    await this.db
      .insert(pendingEvents)
      .values({
        id: event.id,
        sessionKey: event.sessionKey,
        subject: event.subject,
        payload: event.payload,
        priority: event.priority,
        createdAt: new Date(),
      })
      .onConflictDoNothing();
  }

  async fetchPending(sessionKey: string): Promise<DbPendingEvent[]> {
    return this.db
      .select()
      .from(pendingEvents)
      .where(and(eq(pendingEvents.sessionKey, sessionKey), isNull(pendingEvents.deliveredAt)))
      .orderBy(desc(pendingEvents.priority));
  }

  async markDelivered(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.db
      .update(pendingEvents)
      .set({ deliveredAt: new Date() })
      .where(inArray(pendingEvents.id, ids));
  }

  async countPending(): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(pendingEvents)
      .where(isNull(pendingEvents.deliveredAt));
    return result[0]?.count ?? 0;
  }

  async cleanup(ttlSeconds: number): Promise<number> {
    const cutoff = new Date(Date.now() - ttlSeconds * 1000);
    const result = await this.db
      .delete(pendingEvents)
      .where(and(lt(pendingEvents.deliveredAt, cutoff))) as unknown as { changes: number };
    return result.changes;
  }
}
