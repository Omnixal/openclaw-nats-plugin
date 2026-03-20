import { Service, BaseService } from '@onebun/core';
import { DrizzleService, eq, sql } from '@onebun/drizzle';
import { eventRoutes, type DbEventRoute, type NewEventRoute } from '../db/schema';

@Service()
export class RouterRepository extends BaseService {
  constructor(private db: DrizzleService) {
    super();
  }

  async findAll(filters?: { pattern?: string; target?: string }): Promise<DbEventRoute[]> {
    let query = this.db.select().from(eventRoutes);
    if (filters?.pattern) {
      query = query.where(eq(eventRoutes.pattern, filters.pattern)) as any;
    } else if (filters?.target) {
      query = query.where(eq(eventRoutes.target, filters.target)) as any;
    }
    return query.orderBy(eventRoutes.priority) as any;
  }

  async findEnabled(): Promise<DbEventRoute[]> {
    return this.db.select().from(eventRoutes)
      .where(eq(eventRoutes.enabled, true))
      .orderBy(eventRoutes.priority) as any;
  }

  async create(route: NewEventRoute): Promise<DbEventRoute> {
    const [created] = await this.db.insert(eventRoutes).values(route).returning();
    return created;
  }

  async upsert(route: NewEventRoute): Promise<{ route: DbEventRoute; created: boolean }> {
    const [result] = await this.db
      .insert(eventRoutes)
      .values(route)
      .onConflictDoUpdate({
        target: eventRoutes.pattern,
        set: {
          target: sql`excluded.target`,
          priority: sql`excluded.priority`,
          enabled: sql`excluded.enabled`,
        },
      })
      .returning();

    const created = result.createdAt.getTime() === route.createdAt!.getTime();
    return { route: result, created };
  }

  async recordDelivery(routeId: string, subject: string): Promise<void> {
    await this.db.update(eventRoutes)
      .set({
        lastDeliveredAt: new Date(),
        lastEventSubject: subject,
        deliveryCount: sql`${eventRoutes.deliveryCount} + 1`,
      })
      .where(eq(eventRoutes.id, routeId));
  }

  async deleteById(id: string): Promise<boolean> {
    const result = await this.db.delete(eventRoutes).where(eq(eventRoutes.id, id)).returning();
    return result.length > 0;
  }

  async deleteByPattern(pattern: string): Promise<boolean> {
    const result = await this.db.delete(eventRoutes).where(eq(eventRoutes.pattern, pattern)).returning();
    return result.length > 0;
  }

  async count(): Promise<number> {
    const rows = await this.db.select().from(eventRoutes);
    return rows.length;
  }
}
