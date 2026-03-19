# NATS Events Skill + Unified Event Routing

## Overview

Refactor the NATS plugin from dual-stream architecture (events + inbound) to a unified event stream with configurable routing. Add OpenClaw agent tools and a skill that teaches the agent event-driven patterns.

## Goals

- Eliminate `agent.inbound.*` stream — unify everything under `agent.events.*`
- Agent subscribes to events explicitly via routing rules stored in SQLite
- Agent publishes events and creates cron tasks through native OpenClaw tools
- Cron tasks use a pure bash script (no LLM invocation) to publish events
- Skill provides bootstrap procedure and event-driven behavior patterns

## Architecture

```
  OpenClaw Agent
       │
       ├── nats_publish(subject, payload)      ← registerTool
       ├── nats_subscribe(pattern, target?)     ← registerTool
       ├── nats_unsubscribe(pattern)            ← registerTool
       └── nats_subscriptions(pattern?, target?) ← registerTool
               │
               │  HTTP POST /api/publish, /api/routes
               ▼
         NATS Sidecar (port 3104)
               │
               ├── Publisher → NATS JetStream (agent.events.>)
               ├── Router   → SQLite event_routes table
               └── Consumer → agent.events.> → match routes → inject to gateway session
               │
               ▼
         NATS JetStream
           └── agent_events stream (agent.events.>, limits, 7d)
           └── agent_dlq stream (agent.dlq.>, limits, 7d)
```

## 1. Unified Stream `agent_events`

Remove `agent_inbound` stream. All events go to `agent_events` with subjects `agent.events.>`.

### Subject Hierarchy

| Subject | Description |
|---|---|
| `agent.events.session.*` | Session start/stop/reset |
| `agent.events.subagent.*` | Subagent spawned/ended |
| `agent.events.tool.*` | Tool results (completed/failed) |
| `agent.events.cron.*` | Cron triggers |
| `agent.events.hook.*` | External webhook triggers |
| `agent.events.gateway.*` | Gateway startup/restart |
| `agent.events.message.*` | Message delivery status |
| `agent.events.context.*` | Context compaction |
| `agent.events.custom.*` | Agent-defined custom events |

## 2. Routing Table (`event_routes`)

Drizzle schema in `sidecar/src/db/schema.ts`:

```typescript
export const eventRoutes = sqliteTable('event_routes', {
  id:        text('id').primaryKey(),           // ULID
  pattern:   text('pattern').notNull().unique(), // exact or wildcard "agent.events.cron.*"
  target:    text('target').notNull().default('main'), // session key
  enabled:   integer('enabled', { mode: 'boolean' }).notNull().default(true),
  priority:  integer('priority').notNull().default(5),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});
```

### Matching Logic

- Exact match: `agent.events.cron.daily-report` matches only that subject
- Wildcard `*`: `agent.events.cron.*` matches one level (`agent.events.cron.daily-report` but not `agent.events.cron.reports.weekly`)
- Wildcard `>`: `agent.events.cron.>` matches all descendants
- When multiple routes match, highest priority wins (lowest number = highest priority)
- No matching route = event is stored only (not delivered to agent)

## 3. Sidecar API — Route Management

All endpoints behind `ApiKeyMiddleware`.

```
GET    /api/routes                  — list routes (optional ?pattern=...&target=...)
POST   /api/routes                  — create { pattern, target?, priority? }
DELETE /api/routes/:id              — delete route by id
GET    /api/routes/status           — { configured: boolean, count: number }
```

### GET /api/routes query filters

- `?pattern=agent.events.cron.*` — who is subscribed to this pattern
- `?target=main` — what patterns are routed to this session

### GET /api/routes/status

Cheap check for bootstrap guard. Returns `{ configured: true, count: 3 }`. No route details, minimal tokens.

## 4. OpenClaw Agent Tools

Registered via `api.registerTool()` in `plugins/nats-context-engine/index.ts`.

### `nats_publish`

```typescript
{
  name: "nats_publish",
  description: "Publish an event to the NATS event bus",
  parameters: {
    type: "object",
    properties: {
      subject: { type: "string", description: "Event subject (must start with agent.events.)" },
      payload: { type: "object", description: "Event payload data" },
    },
    required: ["subject", "payload"],
  },
  async execute(_id, params) {
    // HTTP POST to sidecar /api/publish
  },
}
```

### `nats_subscribe`

```typescript
{
  name: "nats_subscribe",
  description: "Subscribe to events matching a pattern. Events will be delivered to the target session.",
  parameters: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Subject pattern (exact or wildcard with * or >)" },
      target:  { type: "string", description: "Session key to deliver to (default: main)" },
    },
    required: ["pattern"],
  },
}
```

### `nats_unsubscribe`

```typescript
{
  name: "nats_unsubscribe",
  description: "Remove an event subscription by pattern",
  parameters: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "The pattern to unsubscribe from" },
    },
    required: ["pattern"],
  },
}
```

### `nats_subscriptions`

```typescript
{
  name: "nats_subscriptions",
  description: "List current event subscriptions with optional filters",
  parameters: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Filter: show who is subscribed to this pattern" },
      target:  { type: "string", description: "Filter: show what patterns route to this session" },
    },
  },
}
```

## 5. Cron Trigger Script

Located at `skills/nats-events/scripts/nats-cron-trigger.sh`. Bundled resource in the skill.

```bash
#!/usr/bin/env bash
# Usage: nats-cron-trigger.sh <subject> [payload_json]
# Pure algorithmic — no LLM involved.
set -euo pipefail
SIDECAR="${NATS_SIDECAR_URL:-http://127.0.0.1:3104}"
curl -sf -X POST "$SIDECAR/api/publish" \
  -H "Authorization: Bearer $NATS_PLUGIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"subject\":\"$1\",\"payload\":${2:-\"{}\"}}"
```

Agent creates cron jobs that call this script:
```
*/30 * * * * /path/to/nats-cron-trigger.sh agent.events.cron.check-revenue '{"task":"check_revenue"}'
```

## 6. Skill `nats-events/SKILL.md`

Located at `skills/nats-events/SKILL.md`. Loaded automatically when plugin is enabled.

### Content Structure

1. **Bootstrap guard** — call `nats_subscriptions`. If non-empty, setup is done, skip. If empty, run initial setup: subscribe to standard events (cron, subagent.ended, hook, etc.)
2. **Event-driven patterns** — react to events, don't poll. Every action that needs a response should publish an event and subscribe to the result.
3. **Cron pattern** — always use `nats-cron-trigger.sh`, never invoke LLM from cron. Subscribe to the cron subject first, then create the cron job.
4. **Subject reference** — table of standard subjects and their payloads
5. **Examples** — concrete scenarios (schedule a task, react to subagent completion, handle external webhook)

## 7. File Changes Summary

### New files

| File | Description |
|---|---|
| `skills/nats-events/SKILL.md` | Agent behavior skill |
| `skills/nats-events/scripts/nats-cron-trigger.sh` | Cron trigger script |
| `sidecar/src/router/router.module.ts` | Router DI module |
| `sidecar/src/router/router.service.ts` | Route matching logic |
| `sidecar/src/router/router.repository.ts` | SQLite CRUD for event_routes |
| `sidecar/src/router/router.controller.ts` | REST API /api/routes |
| `sidecar/src/db/migrations/XXXX_add_event_routes.sql` | Migration |

### Modified files

| File | Change |
|---|---|
| `openclaw.plugin.json` | Add `"skills": ["./skills"]` |
| `plugins/nats-context-engine/index.ts` | Add 4x `api.registerTool()` calls |
| `sidecar/src/db/schema.ts` | Add `eventRoutes` table |
| `sidecar/src/consumer/consumer.controller.ts` | Subscribe to `agent.events.>`, use RouterService for delivery decisions |
| `sidecar/src/publisher/publisher.controller.ts` | Remove `agent.events.` prefix restriction (now the only prefix) |
| `sidecar/src/index.ts` | Remove `agent_inbound` stream from JetStream config |
| `sidecar/src/app.module.ts` | Import RouterModule |
| `sidecar/src/config.ts` | (no changes needed) |
| `package.json` | Add `skills/` to `files` array |

### Removed concepts

- `agent_inbound` stream — merged into `agent_events`
- `agent.inbound.>` subject namespace — everything is `agent.events.>` now
