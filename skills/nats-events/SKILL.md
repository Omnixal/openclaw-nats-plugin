---
name: nats-events
description: Event-driven patterns for NATS. Use when the agent needs to publish events, subscribe to event patterns, set up cron-based triggers, or react to incoming NATS messages. Triggers on any mention of NATS, events, subscriptions, cron scheduling, or event-driven workflows.
---

# NATS Event Bus

You have access to a NATS JetStream event bus via these tools:

| Tool | Purpose |
|---|---|
| `nats_publish` | Publish an event (subject + payload) |
| `nats_subscribe` | Create a routing rule (pattern -> session) — idempotent, safe to repeat |
| `nats_unsubscribe` | Remove a routing rule by ID |
| `nats_subscriptions` | List routing rules (optional filters: pattern, target) |
| `nats_cron_add` | Schedule a recurring NATS event (no LLM wake) |
| `nats_cron_remove` | Remove a scheduled cron job |
| `nats_cron_list` | List all scheduled cron jobs |

## Bootstrap

Before first use, set up default subscriptions. This is idempotent — safe to run multiple times:

```
nats_subscribe(pattern: "agent.events.cron.>",      target: "main")
nats_subscribe(pattern: "agent.events.subagent.>",   target: "main")
nats_subscribe(pattern: "agent.events.hook.>",       target: "main")
nats_subscribe(pattern: "agent.events.custom.>",     target: "main")
```

## Event-Driven Rules

1. **Never poll** — subscribe to events and react when they arrive as messages
2. **Incoming events** arrive as chat messages formatted `[NATS:<subject>] <payload>`

## Scheduling Events (Cron)

Use `nats_cron_add` for scheduled events. This fires directly without waking the LLM:

```
# Schedule a daily report trigger at 9am UTC
nats_cron_add(
  name: "daily-report",
  cron: "0 9 * * *",
  subject: "agent.events.cron.daily-report",
  payload: { "task": "daily_report" }
)

# Schedule hourly revenue check
nats_cron_add(
  name: "hourly-check",
  cron: "0 * * * *",
  subject: "agent.events.cron.check-revenue",
  payload: { "task": "check_revenue" }
)

# List all scheduled jobs
nats_cron_list()

# Remove a job
nats_cron_remove(name: "hourly-check")
```

Don't forget to also subscribe to the cron subject so you receive the events:
```
nats_subscribe(pattern: "agent.events.cron.>", target: "main")
```

**Alternative (environments with system crontab):** Use `nats-cron-trigger.sh` script.

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
```

**Publish a custom event:**
```
nats_publish(subject: "agent.events.custom.report-ready", payload: {"reportUrl": "https://..."})
```

**Set up daily workflow:**
```
nats_subscribe(pattern: "agent.events.cron.daily-report", target: "main")
nats_cron_add(name: "daily-report", cron: "0 9 * * *", subject: "agent.events.cron.daily-report", payload: {"task": "report"})
```
