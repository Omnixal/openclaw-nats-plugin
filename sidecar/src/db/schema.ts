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
