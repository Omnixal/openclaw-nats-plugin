---
name: nats-events
description: Event-driven patterns for NATS. Use when the agent needs to publish events, subscribe to event patterns, set up cron-based triggers, manage timers, or react to incoming NATS messages. Triggers on any mention of NATS, events, subscriptions, cron scheduling, timers, or event-driven workflows.
---

# NATS Event Bus

You have access to a NATS JetStream event bus via these tools:

## Core Tools

| Tool | Purpose |
|---|---|
| `nats_publish` | Publish an event (subject + payload) |
| `nats_subscribe` | Create a routing rule (pattern -> session) — idempotent, safe to repeat |
| `nats_unsubscribe` | Remove a routing rule by ID |
| `nats_subscriptions` | List routing rules (optional filters: pattern, target) |
| `nats_route_update` | Update a route (target, priority, enabled) by ID |

## Cron (Recurring) Tools

| Tool | Purpose |
|---|---|
| `nats_cron_add` | Schedule a recurring NATS event (no LLM wake) |
| `nats_cron_update` | Update a cron job (schedule, subject, payload, timezone, enabled) |
| `nats_cron_toggle` | Toggle a cron job on/off |
| `nats_cron_run` | Manually fire a cron job right now |
| `nats_cron_remove` | Remove a scheduled cron job |
| `nats_cron_list` | List all scheduled cron jobs |

## Timer (One-Shot Delayed) Tools

| Tool | Purpose |
|---|---|
| `nats_timer_set` | Set a one-shot delayed event (fires once after delay) |
| `nats_timer_cancel` | Cancel a pending timer |
| `nats_timer_list` | List all timers with remaining time |

## Bootstrap

Before first use, set up default subscriptions. This is idempotent — safe to run multiple times:

```
nats_subscribe(pattern: "agent.events.cron.>",      target: "main")
nats_subscribe(pattern: "agent.events.subagent.>",   target: "main")
nats_subscribe(pattern: "agent.events.hook.>",       target: "main")
nats_subscribe(pattern: "agent.events.custom.>",     target: "main")
nats_subscribe(pattern: "agent.events.timer.>",      target: "main")
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

# Update the schedule to 10am
nats_cron_update(name: "daily-report", cron: "0 10 * * *")

# Temporarily disable
nats_cron_toggle(name: "daily-report")

# Fire manually right now (doesn't affect schedule)
nats_cron_run(name: "daily-report")

# List all scheduled jobs
nats_cron_list()

# Remove a job
nats_cron_remove(name: "daily-report")
```

## Timers (Delayed One-Shot Events)

Use `nats_timer_set` for delayed self-pings, reminders, or deferred checks. Timers survive sidecar restarts.

```
# Check deploy status in 5 minutes
nats_timer_set(
  name: "check-deploy",
  delayMs: 300000,
  subject: "agent.events.timer.check-deploy",
  payload: { "task": "verify_deployment", "deployId": "abc123" }
)

# Set a 1-hour reminder
nats_timer_set(
  name: "followup-reminder",
  delayMs: 3600000,
  subject: "agent.events.timer.reminder",
  payload: { "task": "followup", "context": "check sales" }
)

# Cancel a timer
nats_timer_cancel(name: "check-deploy")

# List pending timers
nats_timer_list()
```

Don't forget to subscribe to timer events:
```
nats_subscribe(pattern: "agent.events.timer.>", target: "main")
```

## Managing Routes

```
# List current routes
nats_subscriptions()

# Update a route's priority or target
nats_route_update(id: "01ABC...", priority: 8)
nats_route_update(id: "01ABC...", enabled: false)
nats_route_update(id: "01ABC...", target: "worker-2")

# Remove a route
nats_unsubscribe(id: "01ABC...")
```

## Subject Hierarchy

| Pattern | Use for |
|---|---|
| `agent.events.cron.*` | Scheduled task triggers |
| `agent.events.timer.*` | Delayed one-shot triggers |
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

**Delayed check after action:**
```
nats_subscribe(pattern: "agent.events.timer.>", target: "main")
nats_timer_set(name: "verify-action", delayMs: 60000, subject: "agent.events.timer.verify", payload: {"check": "result"})
```
