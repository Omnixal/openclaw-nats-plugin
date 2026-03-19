---
name: nats-events
description: Event-driven patterns for NATS. Use when the agent needs to publish events, subscribe to event patterns, set up cron-based triggers, or react to incoming NATS messages. Triggers on any mention of NATS, events, subscriptions, cron scheduling, or event-driven workflows.
---

# NATS Event Bus

You have access to a NATS JetStream event bus via four tools:

| Tool | Purpose |
|---|---|
| `nats_publish` | Publish an event (subject + payload) |
| `nats_subscribe` | Create a routing rule (pattern -> session) |
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

1. **Never poll** — subscribe to events and react when they arrive as messages in your session
2. **Cron is OK** but must go through NATS: cron job calls `nats-cron-trigger.sh` -> event published -> delivered to your session -> you react
3. **Every scheduled task** = cron entry calling `nats-cron-trigger.sh` + subscription on that subject
4. **Incoming events** arrive as chat messages formatted `[NATS:<subject>] <payload>`

## Creating Cron Tasks

Always use the bundled script — never invoke LLM from cron:

```bash
# Step 1: Subscribe to the event
nats_subscribe(pattern: "agent.events.cron.daily-report", target: "main")

# Step 2: Create cron entry using the trigger script
# The script is at: <plugin-dir>/skills/nats-events/scripts/nats-cron-trigger.sh
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
# When subagent finishes, you receive: [NATS:agent.events.subagent.ended] {"subagentId":...,"result":...}
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
