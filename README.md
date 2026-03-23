# @omnixal/openclaw-nats-plugin

NATS JetStream event-driven plugin for [OpenClaw](https://openclaw.ai). Replaces polling-based heartbeat with real-time event streaming.

## What it does

Hooks into OpenClaw Gateway lifecycle and publishes events to NATS JetStream — tool completions, session starts/stops, subagent spawns, commands, context compaction. A sidecar service handles NATS connectivity, deduplication, filtering, and a pending event queue for inbound processing.

## Install

```bash
openclaw plugins install @omnixal/openclaw-nats-plugin
npx @omnixal/openclaw-nats-plugin setup
openclaw gateway restart
```

Setup auto-detects your runtime (Bun or Docker) and configures NATS server + sidecar.

## Published events

| Subject | Trigger |
|---|---|
| `agent.events.gateway.startup` | Gateway starts |
| `agent.events.session.new` | `/new` command |
| `agent.events.session.reset` | `/reset` command |
| `agent.events.session.stop` | `/stop` command |
| `agent.events.session.started` | Session begins |
| `agent.events.session.ended` | Session ends |
| `agent.events.tool.{name}.completed` | Tool succeeds |
| `agent.events.tool.{name}.failed` | Tool fails |
| `agent.events.subagent.spawned` | Subagent created |
| `agent.events.subagent.ended` | Subagent finished |
| `agent.events.agent.run_ended` | Agent run completes |
| `agent.events.message.sent` | Message delivered |
| `agent.events.context.compacted` | Context history compressed |

## Dashboard

Built-in web UI at `/nats-dashboard` on the Gateway. Auto-refreshes every 5 seconds.

- **Health** — NATS server, Gateway, sidecar connectivity, uptime, pending queue size
- **Routes** — create, edit, delete event routing rules (pattern matching with `*` and `>` wildcards, priority, target session)
- **Cron Jobs** — create, edit, delete, pause/resume, run-now; shows next run time and last run status
- **Execution Logs** — per-route and per-cron delivery/fire/error logs with pagination and filters (status, action, subject)
- **Metrics** — per-subject publish/consume counters
- **Pending Events** — queued inbound events with priority and age

## Architecture

```
OpenClaw Gateway
  ├── hooks/gateway-startup     → publishes startup event
  ├── hooks/lifecycle-publisher  → publishes tool results
  ├── hooks/command-publisher    → publishes /new, /reset, /stop
  └── plugins/nats-context-engine
        ├── session/agent/subagent/message/compaction events
        └── /nats-dashboard (Svelte SPA)

NATS Sidecar (OneBun service, port 3104)
  ├── Publisher   → receives events via HTTP, publishes to JetStream
  ├── Consumer    → subscribes to JetStream, delivers to Gateway
  ├── Router      → pattern-based event routing (exact, *, >)
  ├── Scheduler   → cron job management with persistent SQLite storage
  ├── Logs        → execution log recording (deliveries, fires, errors)
  ├── Metrics     → per-subject publish/consume counters
  ├── Dedup       → idempotency key deduplication
  ├── Filter      → subject allowlist/blocklist
  ├── Pending     → SQLite queue for inbound events
  └── Health API  → /api/health for dashboard
```

## Management

```bash
npx @omnixal/openclaw-nats-plugin start       # Start services
npx @omnixal/openclaw-nats-plugin stop        # Stop services
npx @omnixal/openclaw-nats-plugin status      # Health check
npx @omnixal/openclaw-nats-plugin uninstall   # Remove (keeps data)
npx @omnixal/openclaw-nats-plugin uninstall --purge  # Remove everything
```

## Configuration

Environment variables (auto-configured by setup):

| Variable | Default | Description |
|---|---|---|
| `NATS_SIDECAR_URL` | `http://127.0.0.1:3104` | Sidecar HTTP endpoint |
| `NATS_PLUGIN_API_KEY` | *(auto-generated)* | API key for sidecar auth |
| `NATS_SERVERS` | `nats://127.0.0.1:4222` | NATS server URL |

## Requirements

- OpenClaw Gateway v2026.3+
- Bun (recommended) or Docker

## License

MIT
