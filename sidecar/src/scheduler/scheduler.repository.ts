import { Service, BaseService } from '@onebun/core';
import { DrizzleService, eq, sql } from '@onebun/drizzle';
import { cronJobs, type DbCronJob, type NewCronJob } from '../db/schema';

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
    return this.db.select().from(cronJobs).orderBy(cronJobs.name) as any;
  }

  async findAllEnabled(): Promise<DbCronJob[]> {
    return this.db.select().from(cronJobs)
      .where(eq(cronJobs.enabled, true))
      .orderBy(cronJobs.name) as any;
  }

  async findByName(name: string): Promise<DbCronJob | undefined> {
    const [result] = await this.db.select().from(cronJobs)
      .where(eq(cronJobs.name, name));
    return result;
  }

  async deleteByName(name: string): Promise<boolean> {
    const result = await this.db.delete(cronJobs)
      .where(eq(cronJobs.name, name)).returning();
    return result.length > 0;
  }

  async updateLastRun(name: string): Promise<void> {
    await this.db.update(cronJobs)
      .set({ lastRunAt: new Date() })
      .where(eq(cronJobs.name, name));
  }
}
