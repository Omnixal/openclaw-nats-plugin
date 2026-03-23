import { Service, BaseService } from '@onebun/core';
import { DrizzleService, eq, and, desc, sql } from '@onebun/drizzle';
import { executionLogs, type DbExecutionLog, type NewExecutionLog } from '../db/schema';

export interface LogFilters {
  entityType: string;
  entityId: string;
  success?: boolean;
  action?: string;
  subjectLike?: string;
}

@Service()
export class LogRepository extends BaseService {
  constructor(private db: DrizzleService) {
    super();
  }

  async insert(log: NewExecutionLog): Promise<void> {
    await this.db.insert(executionLogs).values(log);
  }

  private buildWhereConditions(filters: LogFilters) {
    const conditions = [
      eq(executionLogs.entityType, filters.entityType),
      eq(executionLogs.entityId, filters.entityId),
    ];
    if (filters.success !== undefined) {
      conditions.push(eq(executionLogs.success, filters.success));
    }
    if (filters.action) {
      conditions.push(eq(executionLogs.action, filters.action));
    }
    if (filters.subjectLike) {
      conditions.push(sql`${executionLogs.subject} LIKE ${'%' + filters.subjectLike + '%'}`);
    }
    return and(...conditions);
  }

  async findByEntity(
    filters: LogFilters,
    limit: number = 50,
    offset: number = 0,
  ): Promise<DbExecutionLog[]> {
    return this.db
      .select()
      .from(executionLogs)
      .where(this.buildWhereConditions(filters))
      .orderBy(desc(executionLogs.createdAt))
      .limit(limit)
      .offset(offset) as any;
  }

  async countByEntity(filters: LogFilters): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(executionLogs)
      .where(this.buildWhereConditions(filters));
    return result[0]?.count ?? 0;
  }

  async findRecent(limit: number = 20): Promise<DbExecutionLog[]> {
    return this.db
      .select()
      .from(executionLogs)
      .orderBy(desc(executionLogs.createdAt))
      .limit(limit) as any;
  }

  async deleteOlderThan(cutoffMs: number): Promise<number> {
    const cutoff = new Date(Date.now() - cutoffMs);
    const result = await this.db
      .delete(executionLogs)
      .where(sql`${executionLogs.createdAt} < ${cutoff.getTime()}`)
      .returning();
    return result.length;
  }
}
