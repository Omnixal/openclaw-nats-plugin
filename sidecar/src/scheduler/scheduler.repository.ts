import { Service, BaseService } from '@onebun/core';
import { DrizzleService, eq, sql, and, lte } from '@onebun/drizzle';
import { cronJobs, timerJobs, type DbCronJob, type NewCronJob, type DbTimerJob, type NewTimerJob } from '../db/schema';

@Service()
export class SchedulerRepository extends BaseService {
  constructor(private db: DrizzleService) {
    super();
  }

  async upsert(job: NewCronJob): Promise<DbCronJob> {
    const [result] = await this.db
      .insert(cronJobs)
      .values(job)
      .onConflictDoUpdate({
        target: cronJobs.name,
        set: {
          expr: sql`excluded.expr`,
          subject: sql`excluded.subject`,
          payload: sql`excluded.payload`,
          timezone: sql`excluded.timezone`,
          enabled: sql`excluded.enabled`,
        },
      })
      .returning();
    return result;
  }

  async findAll(): Promise<DbCronJob[]> {
    // drizzle type limitation: chained .orderBy() loses type info
    return this.db.select().from(cronJobs).orderBy(cronJobs.name) as any;
  }

  async findAllEnabled(): Promise<DbCronJob[]> {
    // drizzle type limitation: chained .where()/.orderBy() loses type info
    return this.db.select().from(cronJobs)
      .where(eq(cronJobs.enabled, true))
      .orderBy(cronJobs.name) as any;
  }

  async findByName(name: string): Promise<DbCronJob | undefined> {
    const [result] = await this.db.select().from(cronJobs)
      .where(eq(cronJobs.name, name));
    return result;
  }

  async updateByName(name: string, fields: Partial<Pick<DbCronJob, 'expr' | 'subject' | 'payload' | 'timezone' | 'enabled'>>): Promise<DbCronJob | null> {
    const [result] = await this.db.update(cronJobs)
      .set(fields)
      .where(eq(cronJobs.name, name))
      .returning();
    return result ?? null;
  }

  async deleteByName(name: string): Promise<boolean> {
    const result = await this.db.delete(cronJobs)
      .where(eq(cronJobs.name, name)).returning();
    return result.length > 0;
  }

  async setEnabled(name: string, enabled: boolean): Promise<void> {
    await this.db.update(cronJobs)
      .set({ enabled })
      .where(eq(cronJobs.name, name));
  }

  async updateLastRun(name: string): Promise<void> {
    await this.db.update(cronJobs)
      .set({ lastRunAt: new Date() })
      .where(eq(cronJobs.name, name));
  }

  // ── Timer Jobs ──────────────────────────────────────────────────────

  async createTimer(timer: NewTimerJob): Promise<DbTimerJob> {
    const [result] = await this.db
      .insert(timerJobs)
      .values(timer)
      .onConflictDoUpdate({
        target: timerJobs.name,
        set: {
          subject: sql`excluded.subject`,
          payload: sql`excluded.payload`,
          delayMs: sql`excluded.delay_ms`,
          fireAt: sql`excluded.fire_at`,
          fired: sql`0`,
        },
      })
      .returning();
    return result;
  }

  async findPendingTimers(): Promise<DbTimerJob[]> {
    return this.db.select().from(timerJobs)
      .where(eq(timerJobs.fired, false)) as any;
  }

  async findTimerByName(name: string): Promise<DbTimerJob | undefined> {
    const [result] = await this.db.select().from(timerJobs)
      .where(eq(timerJobs.name, name));
    return result;
  }

  async markTimerFired(name: string): Promise<void> {
    await this.db.update(timerJobs)
      .set({ fired: true })
      .where(eq(timerJobs.name, name));
  }

  async deleteTimerByName(name: string): Promise<boolean> {
    const result = await this.db.delete(timerJobs)
      .where(eq(timerJobs.name, name)).returning();
    return result.length > 0;
  }

  async findAllTimers(): Promise<DbTimerJob[]> {
    return this.db.select().from(timerJobs).orderBy(timerJobs.fireAt) as any;
  }
}
