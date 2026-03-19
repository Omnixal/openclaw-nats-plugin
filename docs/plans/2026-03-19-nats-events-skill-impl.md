# NATS Events Skill + Unified Event Routing — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Unify NATS streams, add event routing with SQLite-backed subscription table, register OpenClaw agent tools, and create a skill teaching the agent event-driven patterns.

**Architecture:** Single `agent_events` stream replaces dual streams. Sidecar consumer matches incoming events against `event_routes` SQLite table to decide delivery. Agent manages subscriptions via OpenClaw tools that call sidecar REST API.

**Tech Stack:** OneBun (`@onebun/core`, `@onebun/drizzle`, `@onebun/nats`), ArkType validation, Drizzle ORM (SQLite), OpenClaw plugin SDK (`api.registerTool`)

**Design doc:** `docs/plans/2026-03-19-nats-events-skill-design.md`

---

### Task 1: Add `eventRoutes` table to Drizzle schema

**Files:**
- Modify: `sidecar/src/db/schema.ts:1-22`

**Step 1: Write the schema addition**

Add to the end of `sidecar/src/db/schema.ts`:

```typescript
export const eventRoutes = sqliteTable('event_routes', {
  id:        text('id').primaryKey(),
  pattern:   text('pattern').notNull().unique(),
  target:    text('target').notNull().default('main'),
  enabled:   integer('enabled', { mode: 'boolean' }).notNull().default(true),
  priority:  integer('priority').notNull().default(5),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [
  index('event_routes_pattern_idx').on(table.pattern),
  index('event_routes_target_idx').on(table.target),
]);

export type DbEventRoute = typeof eventRoutes.$inferSelect;
export type NewEventRoute = typeof eventRoutes.$inferInsert;
```

**Step 2: Generate migration**

Run: `cd sidecar && bunx onebun-drizzle generate`
Expected: New migration file in `src/db/migrations/`

**Step 3: Commit**

```bash
git add sidecar/src/db/schema.ts sidecar/src/db/migrations/
git commit -m "feat(sidecar): add event_routes table to drizzle schema"
```

---

### Task 2: Create RouterRepository

**Files:**
- Create: `sidecar/src/router/router.repository.ts`
- Test: `sidecar/src/router/router.repository.test.ts`

**Step 1: Write the failing test**

Create `sidecar/src/router/router.repository.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'bun:test';
import { RouterRepository } from './router.repository';
import { eventRoutes } from '../db/schema';
import { ulid } from 'ulid';

// Use in-memory drizzle for unit tests
function createMockRepo() {
  const rows: any[] = [];
  const repo = new RouterRepository() as any;
  repo.db = {
    select: () => ({
      from: () => ({
        where: (cond: any) => {
          // Simplified mock — tests will validate via integration test
          return rows;
        },
        orderBy: () => rows,
      }),
    }),
    insert: () => ({
      values: (val: any) => { rows.push(val); return { returning: () => [val] }; },
    }),
    delete: () => ({
      where: (cond: any) => ({ returning: () => [] }),
    }),
  };
  return { repo: repo as RouterRepository, rows };
}

describe('RouterRepository', () => {
  it('should be importable', () => {
    expect(RouterRepository).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd sidecar && bun test src/router/router.repository.test.ts`
Expected: FAIL — module not found

**Step 3: Write implementation**

Create `sidecar/src/router/router.repository.ts`:

```typescript
import { Service } from '@onebun/core';
import { DrizzleRepository } from '@onebun/drizzle';
import { eventRoutes, type DbEventRoute, type NewEventRoute } from '../db/schema';
import { eq, like } from '@onebun/drizzle/sqlite';

@Service()
export class RouterRepository extends DrizzleRepository {
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
```

**Step 4: Run test to verify it passes**

Run: `cd sidecar && bun test src/router/router.repository.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add sidecar/src/router/
git commit -m "feat(sidecar): add RouterRepository for event_routes CRUD"
```

---

### Task 3: Create RouterService with pattern matching

**Files:**
- Create: `sidecar/src/router/router.service.ts`
- Test: `sidecar/src/router/router.service.test.ts`

**Step 1: Write the failing test**

Create `sidecar/src/router/router.service.test.ts`:

```typescript
import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { RouterService } from './router.service';

function createService() {
  const svc = new RouterService() as any;
  svc.repo = {
    findAll: mock(() => []),
    findEnabled: mock(() => []),
    create: mock((r: any) => r),
    deleteById: mock(() => true),
    deleteByPattern: mock(() => true),
    count: mock(() => 0),
  };
  svc.logger = {
    info: mock(() => {}),
    warn: mock(() => {}),
    debug: mock(() => {}),
    error: mock(() => {}),
  };
  return svc as RouterService;
}

describe('RouterService', () => {
  describe('matchSubject', () => {
    it('matches exact subject', () => {
      const svc = createService() as any;
      expect(svc.matchPattern('agent.events.cron.daily', 'agent.events.cron.daily')).toBe(true);
    });

    it('does not match different exact subject', () => {
      const svc = createService() as any;
      expect(svc.matchPattern('agent.events.cron.daily', 'agent.events.cron.weekly')).toBe(false);
    });

    it('* matches one level', () => {
      const svc = createService() as any;
      expect(svc.matchPattern('agent.events.cron.*', 'agent.events.cron.daily')).toBe(true);
    });

    it('* does not match deeper levels', () => {
      const svc = createService() as any;
      expect(svc.matchPattern('agent.events.cron.*', 'agent.events.cron.reports.weekly')).toBe(false);
    });

    it('> matches all descendants', () => {
      const svc = createService() as any;
      expect(svc.matchPattern('agent.events.cron.>', 'agent.events.cron.reports.weekly')).toBe(true);
    });

    it('> matches one level too', () => {
      const svc = createService() as any;
      expect(svc.matchPattern('agent.events.cron.>', 'agent.events.cron.daily')).toBe(true);
    });

    it('> does not match parent', () => {
      const svc = createService() as any;
      expect(svc.matchPattern('agent.events.cron.>', 'agent.events.cron')).toBe(false);
    });
  });

  describe('findMatchingRoutes', () => {
    it('returns empty when no routes match', async () => {
      const svc = createService();
      (svc as any).repo.findEnabled.mockReturnValue([]);
      const result = await svc.findMatchingRoutes('agent.events.cron.daily');
      expect(result).toEqual([]);
    });

    it('returns matching routes sorted by priority', async () => {
      const svc = createService();
      const routes = [
        { id: '1', pattern: 'agent.events.cron.*', target: 'main', enabled: true, priority: 5 },
        { id: '2', pattern: 'agent.events.cron.daily', target: 'cron:daily', enabled: true, priority: 1 },
      ];
      (svc as any).repo.findEnabled.mockReturnValue(routes);
      const result = await svc.findMatchingRoutes('agent.events.cron.daily');
      expect(result).toHaveLength(2);
      expect(result[0].target).toBe('cron:daily'); // priority 1 first
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd sidecar && bun test src/router/router.service.test.ts`
Expected: FAIL — module not found

**Step 3: Write implementation**

Create `sidecar/src/router/router.service.ts`:

```typescript
import { Service, BaseService } from '@onebun/core';
import { RouterRepository } from './router.repository';
import type { DbEventRoute } from '../db/schema';
import { ulid } from 'ulid';

@Service()
export class RouterService extends BaseService {
  constructor(private repo: RouterRepository) {
    super();
  }

  /** NATS-style pattern matching: exact, * (one level), > (all descendants) */
  matchPattern(pattern: string, subject: string): boolean {
    const patParts = pattern.split('.');
    const subParts = subject.split('.');

    for (let i = 0; i < patParts.length; i++) {
      if (patParts[i] === '>') {
        return i < subParts.length; // > must match at least one token
      }
      if (patParts[i] === '*') {
        if (i >= subParts.length) return false;
        continue;
      }
      if (i >= subParts.length || patParts[i] !== subParts[i]) return false;
    }

    return patParts.length === subParts.length;
  }

  async findMatchingRoutes(subject: string): Promise<DbEventRoute[]> {
    const routes = await this.repo.findEnabled();
    return routes
      .filter(r => this.matchPattern(r.pattern, subject))
      .sort((a, b) => a.priority - b.priority);
  }

  async listRoutes(filters?: { pattern?: string; target?: string }): Promise<DbEventRoute[]> {
    return this.repo.findAll(filters);
  }

  async subscribe(pattern: string, target: string = 'main', priority: number = 5): Promise<DbEventRoute> {
    return this.repo.create({
      id: ulid(),
      pattern,
      target,
      enabled: true,
      priority,
      createdAt: new Date(),
    });
  }

  async unsubscribe(pattern: string): Promise<boolean> {
    return this.repo.deleteByPattern(pattern);
  }

  async deleteById(id: string): Promise<boolean> {
    return this.repo.deleteById(id);
  }

  async status(): Promise<{ configured: boolean; count: number }> {
    const count = await this.repo.count();
    return { configured: count > 0, count };
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd sidecar && bun test src/router/router.service.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add sidecar/src/router/router.service.ts sidecar/src/router/router.service.test.ts
git commit -m "feat(sidecar): add RouterService with NATS-style pattern matching"
```

---

### Task 4: Create RouterController (REST API)

**Files:**
- Create: `sidecar/src/router/router.controller.ts`
- Test: `sidecar/src/router/router.controller.test.ts`

**Step 1: Write the failing test**

Create `sidecar/src/router/router.controller.test.ts`:

```typescript
import { describe, it, expect, mock } from 'bun:test';
import { RouterController } from './router.controller';

function createController() {
  const ctrl = new RouterController() as any;
  ctrl.routerService = {
    listRoutes: mock(() => []),
    subscribe: mock((p: string, t: string, pr: number) => ({
      id: 'test-id', pattern: p, target: t, priority: pr, enabled: true, createdAt: new Date(),
    })),
    deleteById: mock(() => true),
    status: mock(() => ({ configured: false, count: 0 })),
  };
  ctrl.logger = { info: mock(() => {}), warn: mock(() => {}), debug: mock(() => {}), error: mock(() => {}) };
  ctrl.success = (data: any) => ({ status: 200, body: { success: true, result: data } });
  ctrl.error = (msg: string, code: number) => ({ status: code, body: { success: false, error: msg } });
  return ctrl as RouterController;
}

describe('RouterController', () => {
  it('getRoutes returns list from service', async () => {
    const ctrl = createController();
    const res = await ctrl.getRoutes({});
    expect(res.body.success).toBe(true);
    expect(res.body.result).toEqual([]);
  });

  it('createRoute validates pattern prefix', async () => {
    const ctrl = createController();
    const res = await ctrl.createRoute({ pattern: 'bad.subject', target: 'main' });
    expect(res.status).toBe(400);
  });

  it('createRoute accepts valid pattern', async () => {
    const ctrl = createController();
    const res = await ctrl.createRoute({ pattern: 'agent.events.cron.*', target: 'main' });
    expect(res.body.success).toBe(true);
    expect(res.body.result.pattern).toBe('agent.events.cron.*');
  });

  it('getStatus returns configured status', async () => {
    const ctrl = createController();
    const res = await ctrl.getStatus();
    expect(res.body.result).toEqual({ configured: false, count: 0 });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd sidecar && bun test src/router/router.controller.test.ts`
Expected: FAIL — module not found

**Step 3: Write implementation**

Create `sidecar/src/router/router.controller.ts`:

```typescript
import { Controller, Get, Post, Delete, Body, Param, Query, BaseController, UseMiddleware, type OneBunResponse } from '@onebun/core';
import { RouterService } from './router.service';
import { ApiKeyMiddleware } from '../auth/api-key.middleware';
import { type } from 'arktype';

const createRouteSchema = type({
  pattern: 'string',
  'target?': 'string',
  'priority?': 'number',
});

@Controller('/api/routes')
@UseMiddleware(ApiKeyMiddleware)
export class RouterController extends BaseController {
  constructor(private routerService: RouterService) {
    super();
  }

  @Get('/')
  async getRoutes(@Query() query: { pattern?: string; target?: string }): Promise<OneBunResponse> {
    const routes = await this.routerService.listRoutes({
      pattern: query.pattern,
      target: query.target,
    });
    return this.success(routes);
  }

  @Get('/status')
  async getStatus(): Promise<OneBunResponse> {
    const status = await this.routerService.status();
    return this.success(status);
  }

  @Post('/')
  async createRoute(@Body(createRouteSchema) body: { pattern: string; target?: string; priority?: number }): Promise<OneBunResponse> {
    if (!body.pattern.startsWith('agent.events.')) {
      return this.error('pattern must start with agent.events.', 400, 400);
    }
    const route = await this.routerService.subscribe(
      body.pattern,
      body.target ?? 'main',
      body.priority ?? 5,
    );
    return this.success(route);
  }

  @Delete('/:id')
  async deleteRoute(@Param('id') id: string): Promise<OneBunResponse> {
    const deleted = await this.routerService.deleteById(id);
    if (!deleted) {
      return this.error('Route not found', 404, 404);
    }
    return this.success({ deleted: true });
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd sidecar && bun test src/router/router.controller.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add sidecar/src/router/router.controller.ts sidecar/src/router/router.controller.test.ts
git commit -m "feat(sidecar): add RouterController REST API for /api/routes"
```

---

### Task 5: Create RouterModule and wire into AppModule

**Files:**
- Create: `sidecar/src/router/router.module.ts`
- Modify: `sidecar/src/app.module.ts:1-31`

**Step 1: Create RouterModule**

Create `sidecar/src/router/router.module.ts`:

```typescript
import { Module } from '@onebun/core';
import { RouterRepository } from './router.repository';
import { RouterService } from './router.service';
import { RouterController } from './router.controller';

@Module({
  controllers: [RouterController],
  providers: [RouterRepository, RouterService],
  exports: [RouterService],
})
export class RouterModule {}
```

**Step 2: Add RouterModule to AppModule**

In `sidecar/src/app.module.ts`, add import for `RouterModule` and add to `imports` array:

```typescript
import { RouterModule } from './router/router.module';

@Module({
  imports: [
    DrizzleModule.forRoot({ ... }),
    DedupModule,
    PublisherModule,
    PreHandlersModule,
    GatewayClientModule,
    ConsumerModule,
    PendingModule,
    HealthModule,
    RouterModule,  // ← add
  ],
})
export class AppModule {}
```

**Step 3: Run all existing tests to verify nothing breaks**

Run: `cd sidecar && bun test`
Expected: All existing tests PASS

**Step 4: Commit**

```bash
git add sidecar/src/router/router.module.ts sidecar/src/app.module.ts
git commit -m "feat(sidecar): wire RouterModule into AppModule"
```

---

### Task 6: Remove `agent_inbound` stream, update consumer

**Files:**
- Modify: `sidecar/src/index.ts:25-30` — remove `agent_inbound` stream
- Modify: `sidecar/src/consumer/consumer.controller.ts:23` — change subscription to `agent.events.>`
- Modify: `sidecar/src/consumer/consumer.controller.ts:39-56` — use RouterService for delivery
- Modify: `sidecar/src/consumer/consumer.module.ts:1-10` — import RouterModule
- Modify: `sidecar/src/health/health.service.ts:52` — update streams list
- Test: `sidecar/src/consumer/consumer.controller.test.ts` (if exists, update)

**Step 1: Remove `agent_inbound` stream from index.ts**

In `sidecar/src/index.ts`, remove lines 26-30 (the `agent_inbound` stream entry):

```typescript
      streams: [
        {
          name: 'agent_events',
          subjects: ['agent.events.>'],
          retention: 'limits',
          maxAge: SEVEN_DAYS_NS,
        },
        {
          name: 'agent_dlq',
          subjects: ['agent.dlq.>'],
          retention: 'limits',
          maxAge: SEVEN_DAYS_NS,
        },
      ],
```

**Step 2: Update ConsumerModule to import RouterModule**

In `sidecar/src/consumer/consumer.module.ts`:

```typescript
import { Module } from '@onebun/core';
import { ConsumerController } from './consumer.controller';
import { PreHandlersModule } from '../pre-handlers/pre-handlers.module';
import { PendingModule } from '../pending/pending.module';
import { RouterModule } from '../router/router.module';

@Module({
  imports: [PreHandlersModule, PendingModule, RouterModule],
  controllers: [ConsumerController],
})
export class ConsumerModule {}
```

**Step 3: Update ConsumerController**

In `sidecar/src/consumer/consumer.controller.ts`:
- Change `@Subscribe('agent.inbound.>')` to `@Subscribe('agent.events.>')`
- Add `RouterService` to constructor
- Use `RouterService.findMatchingRoutes()` to decide delivery

```typescript
import { Controller, BaseController, Subscribe, OnQueueReady, type Message } from '@onebun/core';
import { PipelineService } from '../pre-handlers/pipeline.service';
import { GatewayClientService } from '../gateway/gateway-client.service';
import { PendingService } from '../pending/pending.service';
import { RouterService } from '../router/router.service';
import type { NatsEventEnvelope } from '../publisher/envelope';

@Controller('/consumer')
export class ConsumerController extends BaseController {
  constructor(
    private pipeline: PipelineService,
    private gatewayClient: GatewayClientService,
    private pendingService: PendingService,
    private routerService: RouterService,
  ) {
    super();
  }

  @OnQueueReady()
  onReady() {
    const consumerName = this.config.get('consumer.name');
    this.logger.info(`Queue connected, consuming as ${consumerName}`);
  }

  @Subscribe('agent.events.>', {
    ackMode: 'manual',
    group: 'openclaw-main',
  })
  async handleInbound(message: Message<unknown>): Promise<void> {
    try {
      const envelope = this.extractEnvelope(message);

      const { result, ctx } = await this.pipeline.process(envelope);
      if (result === 'drop') {
        await message.ack();
        return;
      }

      // Check routing rules
      const routes = await this.routerService.findMatchingRoutes(envelope.subject);
      if (routes.length === 0) {
        // No route — just store/ack (event is in JetStream for audit)
        await message.ack();
        return;
      }

      // Deliver to each matching target
      if (this.gatewayClient.isAlive()) {
        for (const route of routes) {
          await this.gatewayClient.inject({
            target: route.target,
            message: this.formatMessage(envelope),
            metadata: {
              source: 'nats',
              eventId: envelope.id,
              subject: envelope.subject,
              priority: (ctx.enrichments['priority'] as number) ?? envelope.meta?.priority ?? 5,
            },
          });
        }
        await message.ack();
      } else {
        await this.pendingService.addPending(envelope);
        await message.ack();
        this.logger.warn(`Gateway unavailable, stored pending event ${envelope.id}`);
      }
    } catch (err) {
      this.logger.error('Failed to process message', err);
      await message.nack(true);
    }
  }

  private extractEnvelope(message: Message<unknown>): NatsEventEnvelope {
    const data = message.data as any;
    if (data && typeof data === 'object' && 'subject' in data && 'payload' in data) {
      return data as NatsEventEnvelope;
    }
    if (typeof data === 'string') {
      return JSON.parse(data) as NatsEventEnvelope;
    }
    throw new Error('Unable to extract envelope from message');
  }

  private formatMessage(envelope: NatsEventEnvelope): string {
    return `[NATS:${envelope.subject}] ${JSON.stringify(envelope.payload)}`;
  }
}
```

**Step 4: Update health service streams list**

In `sidecar/src/health/health.service.ts:52`, change:

```typescript
streams: ['agent_events', 'agent_dlq'],
```

**Step 5: Remove publisher subject restriction**

In `sidecar/src/publisher/publisher.controller.ts:15`, remove the `agent.events.` check (now the only valid prefix, no restriction needed). Replace lines 14-18:

```typescript
  @Post()
  async publish(@Body(publishBodySchema) body: PublishBody): Promise<OneBunResponse> {
    if (!body.subject.startsWith('agent.')) {
      return this.error('subject must start with agent.', 400, 400);
    }
    await this.publisherService.publish(body.subject, body.payload, body.meta);
    return this.success({ published: true });
  }
```

**Step 6: Run all tests**

Run: `cd sidecar && bun test`
Expected: All tests PASS (some existing consumer tests may need updating for the new subscription subject)

**Step 7: Commit**

```bash
git add sidecar/src/index.ts sidecar/src/consumer/ sidecar/src/health/health.service.ts sidecar/src/publisher/publisher.controller.ts
git commit -m "feat(sidecar): unify streams, route events via RouterService"
```

---

### Task 7: Update integration test for unified stream

**Files:**
- Modify: `sidecar/src/integration.test.ts`

**Step 1: Update stream config in test**

In `sidecar/src/integration.test.ts`, remove the `agent_inbound` stream from the `streams` array (lines 46-51). Keep only `agent_events` and `agent_dlq`.

**Step 2: Add route management test cases**

Add after existing tests:

```typescript
  // --- Route management ---

  it('GET /api/routes/status with auth returns not configured', async () => {
    const res = await module.inject('GET', '/api/routes/status', {
      headers: { 'Authorization': `Bearer ${API_KEY}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    const data = body.result ?? body;
    expect(data.configured).toBe(false);
    expect(data.count).toBe(0);
  });

  it('POST /api/routes creates a subscription', async () => {
    const res = await module.inject('POST', '/api/routes', {
      headers: { 'Authorization': `Bearer ${API_KEY}` },
      body: { pattern: 'agent.events.cron.*', target: 'main' },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    const data = body.result ?? body;
    expect(data.pattern).toBe('agent.events.cron.*');
    expect(data.target).toBe('main');
  });

  it('GET /api/routes lists subscriptions', async () => {
    const res = await module.inject('GET', '/api/routes', {
      headers: { 'Authorization': `Bearer ${API_KEY}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    const data = body.result ?? body;
    expect(data.length).toBeGreaterThan(0);
  });

  it('GET /api/routes?target=main filters by target', async () => {
    const res = await module.inject('GET', '/api/routes?target=main', {
      headers: { 'Authorization': `Bearer ${API_KEY}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    const data = body.result ?? body;
    expect(data.every((r: any) => r.target === 'main')).toBe(true);
  });

  it('POST /api/routes rejects bad pattern prefix', async () => {
    const res = await module.inject('POST', '/api/routes', {
      headers: { 'Authorization': `Bearer ${API_KEY}` },
      body: { pattern: 'bad.subject', target: 'main' },
    });
    expect(res.status).not.toBe(200);
  });

  it('POST /api/routes requires auth', async () => {
    const res = await module.inject('POST', '/api/routes', {
      body: { pattern: 'agent.events.test.*', target: 'main' },
    });
    expect(res.status).toBe(401);
  });
```

**Step 3: Run integration test**

Run: `cd sidecar && bun test src/integration.test.ts`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add sidecar/src/integration.test.ts
git commit -m "test(sidecar): update integration tests for unified stream and routes API"
```

---

### Task 8: Register OpenClaw agent tools

**Files:**
- Modify: `plugins/nats-context-engine/index.ts:1-89`

**Step 1: Add tool registrations**

Add the following after the existing hook registrations (after line 79, before the dashboard route):

```typescript
  // ── Agent Tools ─────────────────────────────────────────────────

  const SIDECAR_URL = process.env.NATS_SIDECAR_URL || 'http://127.0.0.1:3104';
  const SIDECAR_KEY = process.env.NATS_PLUGIN_API_KEY || 'dev-nats-plugin-key';

  const sidecarFetch = async (path: string, options: RequestInit = {}) => {
    const res = await fetch(`${SIDECAR_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SIDECAR_KEY}`,
        ...options.headers,
      },
      signal: AbortSignal.timeout(5000),
    });
    return res.json();
  };

  api.registerTool({
    name: 'nats_publish',
    description: 'Publish an event to the NATS event bus. Use for cron triggers, custom events, task notifications.',
    parameters: {
      type: 'object',
      properties: {
        subject: { type: 'string', description: 'Event subject (must start with agent.events.)' },
        payload: { type: 'object', description: 'Event payload data' },
      },
      required: ['subject', 'payload'],
    },
    async execute(_id: string, params: any) {
      const result = await sidecarFetch('/api/publish', {
        method: 'POST',
        body: JSON.stringify({ subject: params.subject, payload: params.payload }),
      });
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    },
  });

  api.registerTool({
    name: 'nats_subscribe',
    description: 'Subscribe to events matching a pattern. Matched events will be delivered to the target session as messages.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Subject pattern (exact, or wildcard with * for one level, > for all descendants)' },
        target: { type: 'string', description: 'Session key to deliver to (default: main)' },
      },
      required: ['pattern'],
    },
    async execute(_id: string, params: any) {
      const result = await sidecarFetch('/api/routes', {
        method: 'POST',
        body: JSON.stringify({ pattern: params.pattern, target: params.target ?? 'main' }),
      });
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    },
  });

  api.registerTool({
    name: 'nats_unsubscribe',
    description: 'Remove an event subscription by its ID.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Route ID to delete (from nats_subscriptions)' },
      },
      required: ['id'],
    },
    async execute(_id: string, params: any) {
      const result = await sidecarFetch(`/api/routes/${params.id}`, { method: 'DELETE' });
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    },
  });

  api.registerTool({
    name: 'nats_subscriptions',
    description: 'List event subscriptions. Optionally filter by pattern or target session.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Filter: show routes matching this pattern' },
        target: { type: 'string', description: 'Filter: show routes delivering to this session' },
      },
    },
    async execute(_id: string, params: any) {
      const qs = new URLSearchParams();
      if (params?.pattern) qs.set('pattern', params.pattern);
      if (params?.target) qs.set('target', params.target);
      const path = qs.toString() ? `/api/routes?${qs}` : '/api/routes';
      const result = await sidecarFetch(path);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    },
  });
```

**Step 2: Run sidecar tests to make sure nothing broke**

Run: `cd sidecar && bun test`
Expected: All PASS

**Step 3: Commit**

```bash
git add plugins/nats-context-engine/index.ts
git commit -m "feat(plugin): register nats_publish, nats_subscribe, nats_unsubscribe, nats_subscriptions tools"
```

---

### Task 9: Update plugin manifest and package.json

**Files:**
- Modify: `openclaw.plugin.json`
- Modify: `package.json:15-29` (files array)

**Step 1: Add skills to plugin manifest**

Update `openclaw.plugin.json`:

```json
{
  "id": "openclaw-nats-plugin",
  "skills": ["./skills"],
  "configSchema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {}
  }
}
```

**Step 2: Add skills/ to package.json files array**

In `package.json`, add `"skills/"` to the `files` array (after `"sidecar/"`):

```json
  "files": [
    "index.ts",
    "bin/",
    "cli/",
    "hooks/",
    "plugins/",
    "sidecar/",
    "skills/",
    "docker/",
    "dashboard/dist/",
    "openclaw.plugin.json",
    "PLUGIN.md",
    "!**/*.test.ts",
    "!**/node_modules",
    "!sidecar/data"
  ],
```

**Step 3: Commit**

```bash
git add openclaw.plugin.json package.json
git commit -m "feat(plugin): add skills directory to manifest and package files"
```

---

### Task 10: Create cron trigger script

**Files:**
- Create: `skills/nats-events/scripts/nats-cron-trigger.sh`

**Step 1: Create the script**

```bash
#!/usr/bin/env bash
# nats-cron-trigger.sh — Publish a NATS event from cron (no LLM involved).
#
# Usage:
#   nats-cron-trigger.sh <subject> [payload_json]
#
# Examples:
#   nats-cron-trigger.sh agent.events.cron.daily-report
#   nats-cron-trigger.sh agent.events.cron.check-revenue '{"task":"check_revenue"}'
#
# Environment:
#   NATS_SIDECAR_URL    — Sidecar HTTP URL  (default: http://127.0.0.1:3104)
#   NATS_PLUGIN_API_KEY — Bearer token       (required)

set -euo pipefail

SUBJECT="${1:?Usage: nats-cron-trigger.sh <subject> [payload_json]}"
PAYLOAD="${2:-"{}"}"
SIDECAR="${NATS_SIDECAR_URL:-http://127.0.0.1:3104}"

if [ -z "${NATS_PLUGIN_API_KEY:-}" ]; then
  echo "Error: NATS_PLUGIN_API_KEY is not set" >&2
  exit 1
fi

exec curl -sf -X POST "${SIDECAR}/api/publish" \
  -H "Authorization: Bearer ${NATS_PLUGIN_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"subject\":\"${SUBJECT}\",\"payload\":${PAYLOAD}}"
```

**Step 2: Make executable**

Run: `chmod +x skills/nats-events/scripts/nats-cron-trigger.sh`

**Step 3: Commit**

```bash
git add skills/nats-events/scripts/
git commit -m "feat(skill): add nats-cron-trigger.sh for LLM-free cron event publishing"
```

---

### Task 11: Create SKILL.md

**Files:**
- Create: `skills/nats-events/SKILL.md`

**Step 1: Write the skill**

```markdown
---
name: nats-events
description: Event-driven patterns for NATS. Use when the agent needs to publish events, subscribe to event patterns, set up cron-based triggers, or react to incoming NATS messages. Triggers on any mention of NATS, events, subscriptions, cron scheduling, or event-driven workflows.
---

# NATS Event Bus

You have access to a NATS JetStream event bus via four tools:

| Tool | Purpose |
|---|---|
| `nats_publish` | Publish an event (subject + payload) |
| `nats_subscribe` | Create a routing rule (pattern → session) |
| `nats_unsubscribe` | Remove a routing rule by ID |
| `nats_subscriptions` | List routing rules (optional filters: pattern, target) |

## Bootstrap

Before first use, check if subscriptions are configured:

1. Call `nats_subscriptions` with no arguments
2. If the list is **non-empty** — setup is complete, proceed with your task
3. If **empty** — run initial setup:

```
nats_subscribe(pattern: "agent.events.cron.>",      target: "main")
nats_subscribe(pattern: "agent.events.subagent.>",   target: "main")
nats_subscribe(pattern: "agent.events.hook.>",       target: "main")
nats_subscribe(pattern: "agent.events.custom.>",     target: "main")
```

Do NOT repeat bootstrap if subscriptions already exist.

## Event-Driven Rules

1. **Never poll** — subscribe to events and react when they arrive as messages
2. **Cron is OK** but must go through NATS: cron job calls `nats-cron-trigger.sh` → event published → delivered to your session → you react
3. **Every scheduled task** = cron entry calling `nats-cron-trigger.sh` + subscription on that subject
4. **Incoming events** arrive as chat messages formatted `[NATS:subject] {payload}`

## Creating Cron Tasks

Always use the bundled script — never invoke LLM from cron:

```bash
# Step 1: Subscribe to the event
nats_subscribe(pattern: "agent.events.cron.daily-report", target: "main")

# Step 2: Create cron entry using the trigger script
# The script path is: <plugin-dir>/skills/nats-events/scripts/nats-cron-trigger.sh
*/30 * * * * /path/to/nats-cron-trigger.sh agent.events.cron.check-revenue '{"task":"check_revenue"}'
0 9 * * * /path/to/nats-cron-trigger.sh agent.events.cron.daily-report '{"task":"daily_report"}'
```

The script only needs `NATS_SIDECAR_URL` and `NATS_PLUGIN_API_KEY` environment variables.

## Subject Hierarchy

| Pattern | Use for |
|---|---|
| `agent.events.cron.*` | Scheduled task triggers |
| `agent.events.subagent.spawned` | Subagent started |
| `agent.events.subagent.ended` | Subagent completed |
| `agent.events.hook.*` | External webhook triggers |
| `agent.events.session.*` | Session lifecycle |
| `agent.events.tool.*` | Tool execution results |
| `agent.events.gateway.*` | Gateway startup/restart |
| `agent.events.custom.*` | Your custom events |

## Pattern Matching

- Exact: `agent.events.cron.daily-report` — matches only this subject
- `*` — one level: `agent.events.cron.*` matches `agent.events.cron.daily` but not `agent.events.cron.reports.weekly`
- `>` — all descendants: `agent.events.cron.>` matches everything under `agent.events.cron.`

## Examples

**React to subagent completion:**
```
nats_subscribe(pattern: "agent.events.subagent.ended", target: "main")
# When subagent finishes, you'll receive: [NATS:agent.events.subagent.ended] {"subagentId":...,"result":...}
```

**Publish a custom event for external consumers:**
```
nats_publish(subject: "agent.events.custom.report-ready", payload: {"reportUrl": "https://..."})
```

**Schedule a recurring task:**
```
nats_subscribe(pattern: "agent.events.cron.hourly-check", target: "main")
# Then create crontab: 0 * * * * nats-cron-trigger.sh agent.events.cron.hourly-check '{}'
```
```

**Step 2: Commit**

```bash
git add skills/nats-events/SKILL.md
git commit -m "feat(skill): add nats-events SKILL.md with bootstrap and event-driven patterns"
```

---

### Task 12: Final integration verification

**Step 1: Run all sidecar tests**

Run: `cd sidecar && bun test`
Expected: All tests PASS

**Step 2: Run typecheck**

Run: `cd sidecar && bun run typecheck`
Expected: No errors

**Step 3: Verify plugin structure**

Run: `find skills/ -type f && cat openclaw.plugin.json`
Expected: `skills/nats-events/SKILL.md`, `skills/nats-events/scripts/nats-cron-trigger.sh`, manifest with `"skills": ["./skills"]`

**Step 4: Final commit (if any fixups needed)**

```bash
git add -A
git commit -m "chore: final cleanup for nats-events skill implementation"
```
