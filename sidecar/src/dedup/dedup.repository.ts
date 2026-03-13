import { Service, BaseService } from '@onebun/core';
import { DrizzleService, eq, lt } from '@onebun/drizzle';
import { dedupEvents } from '../db/schema';

@Service()
export class DedupRepository extends BaseService {
  constructor(private db: DrizzleService) {
    super();
  }

  async isDuplicate(eventId: string): Promise<boolean> {
    const rows = await this.db.select().from(dedupEvents).where(eq(dedupEvents.eventId, eventId)).limit(1);
    return rows.length > 0;
  }

  async markSeen(eventId: string, subject: string): Promise<void> {
    await this.db.insert(dedupEvents).values({
      eventId,
      subject,
      seenAt: new Date(),
    }).onConflictDoNothing();
  }

  async cleanup(ttlSeconds: number): Promise<number> {
    const cutoff = new Date(Date.now() - ttlSeconds * 1000);
    const result = await this.db.delete(dedupEvents).where(lt(dedupEvents.seenAt, cutoff)) as unknown as { changes: number };
    return result.changes;
  }
}
