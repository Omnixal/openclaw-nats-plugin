import { sqliteTable, text, integer, index } from '@onebun/drizzle/sqlite';

export const dedupEvents = sqliteTable('dedup_events', {
  eventId: text('event_id').primaryKey(),
  subject: text('subject').notNull(),
  seenAt: integer('seen_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [
  index('dedup_events_seen_at_idx').on(table.seenAt),
]);

export const pendingEvents = sqliteTable('pending_events', {
  id: text('id').primaryKey(),
  sessionKey: text('session_key').notNull(),
  subject: text('subject').notNull(),
  payload: text('payload', { mode: 'json' }).$type<unknown>(),
  priority: integer('priority').notNull().default(5),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  deliveredAt: integer('delivered_at', { mode: 'timestamp_ms' }),
});

export type DbPendingEvent = typeof pendingEvents.$inferSelect;
export type NewPendingEvent = typeof pendingEvents.$inferInsert;

export const eventRoutes = sqliteTable('event_routes', {
  id:        text('id').primaryKey(),
  pattern:   text('pattern').notNull().unique(),
  target:    text('target').notNull().default('main'),
  enabled:   integer('enabled', { mode: 'boolean' }).notNull().default(true),
  priority:  integer('priority').notNull().default(5),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  lastDeliveredAt: integer('last_delivered_at', { mode: 'timestamp_ms' }),
  lastEventSubject: text('last_event_subject'),
  deliveryCount: integer('delivery_count').notNull().default(0),
}, (table) => [
  index('event_routes_pattern_idx').on(table.pattern),
  index('event_routes_target_idx').on(table.target),
]);

export type DbEventRoute = typeof eventRoutes.$inferSelect;
export type NewEventRoute = typeof eventRoutes.$inferInsert;

export const cronJobs = sqliteTable('cron_jobs', {
  id:        text('id').primaryKey(),
  name:      text('name').notNull().unique(),
  expr:      text('expr').notNull(),
  subject:   text('subject').notNull(),
  payload:   text('payload', { mode: 'json' }).$type<unknown>(),
  timezone:  text('timezone').notNull().default('UTC'),
  enabled:   integer('enabled', { mode: 'boolean' }).notNull().default(true),
  lastRunAt: integer('last_run_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [
  index('cron_jobs_name_idx').on(table.name),
]);

export type DbCronJob = typeof cronJobs.$inferSelect;
export type NewCronJob = typeof cronJobs.$inferInsert;
