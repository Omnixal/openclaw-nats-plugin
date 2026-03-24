# NATS JetStream Plugin

Event-driven plugin for OpenClaw that replaces polling-based heartbeat with NATS JetStream messaging.

## Quick Start

    # Install plugin
    openclaw plugins install @omnixal/openclaw-nats-plugin

    # Setup infrastructure (auto-detects Bun or Docker)
    npx @omnixal/openclaw-nats-plugin setup

    # Restart gateway
    openclaw gateway restart

## Setup Options

    # Force Bun mode (downloads nats-server binary, creates systemd/launchd units)
    npx @omnixal/openclaw-nats-plugin setup --runtime=bun

    # Force Docker mode (creates docker-compose with nats + sidecar containers)
    npx @omnixal/openclaw-nats-plugin setup --runtime=docker

Auto-detect priority: Bun > Docker.

## Management

    npx @omnixal/openclaw-nats-plugin start      # Start services
    npx @omnixal/openclaw-nats-plugin stop       # Stop services
    npx @omnixal/openclaw-nats-plugin status     # Health check
    npx @omnixal/openclaw-nats-plugin uninstall  # Remove (keeps data)
    npx @omnixal/openclaw-nats-plugin uninstall --purge  # Remove everything

## Architecture

Plugin hooks make lightweight HTTP calls to a NATS sidecar service for event publishing.

### Hooks
- **gateway-startup** — Publishes gateway startup event, verifies sidecar connectivity
- **lifecycle-publisher** — Publishes tool_result_persist events (tool completed/failed)
- **command-publisher** — Publishes command events (/new, /reset, /stop)

### Plugins
- **nats-context-engine** — Publishes agent lifecycle events via plugin SDK:
  - Subagent spawned/ended
  - Session started/ended
  - Agent run ended
  - Message sent (delivery status)
  - Context compacted (after history summarization)

### Published Events

| Subject | Trigger |
|---|---|
| `agent.events.gateway.startup` | Gateway starts |
| `agent.events.gateway.stopped` | Gateway stops |
| `agent.events.session.new` | `/new` command |
| `agent.events.session.reset` | `/reset` command |
| `agent.events.session.stop` | `/stop` command |
| `agent.events.session.started` | Session begins |
| `agent.events.session.ended` | Session ends |
| `agent.events.tool.{name}.completed` | Tool succeeds |
| `agent.events.tool.{name}.failed` | Tool fails |
| `agent.events.message.received` | Inbound message received |
| `agent.events.message.sent` | Message delivered |
| `agent.events.llm.output` | LLM response received |
| `agent.events.subagent.spawning` | Subagent about to spawn |
| `agent.events.subagent.spawned` | Subagent created |
| `agent.events.subagent.ended` | Subagent finished |
| `agent.events.agent.run_ended` | Agent run completes |
| `agent.events.context.compacted` | Context history compressed |

## Dashboard

The plugin includes a web dashboard at `/nats-dashboard` on the Gateway. Auto-refreshes every 5 seconds. API calls are proxied through the Gateway (no direct sidecar access needed from the browser).

Features:
- **Health** — NATS server, Gateway, sidecar connectivity, uptime, pending queue size, stream configuration
- **Routes** — full CRUD for event routing rules; pattern matching with `*` and `>` wildcards, priority, target session, delivery counters and lag
- **Cron Jobs** — full CRUD, pause/resume, run-now; shows next run time, last run status, timezone support
- **Execution Logs** — per-route and per-cron logs (deliveries, fires, errors) with pagination and filters (status, action type, subject substring)
- **Metrics** — per-subject publish/consume counters with last activity timestamps
- **Pending Events** — queued inbound events with priority and age

Click any route or cron job row to open a detail modal with editing and a logs tab.

Build the dashboard (required after install):

    cd openclaw-nats-plugin/dashboard && bun run build

## Configuration

Environment variables (auto-configured by setup):
- `NATS_SIDECAR_URL` — Sidecar URL (default: `http://127.0.0.1:3104`)
- `NATS_PLUGIN_API_KEY` — API key for sidecar auth (auto-generated)
- `NATS_SERVERS` — NATS server URL (default: `nats://127.0.0.1:4222`)
- `OPENCLAW_GATEWAY_URL` — Gateway HTTP URL (default: `http://127.0.0.1:18789`)
- `OPENCLAW_HOOK_TOKEN` — Webhook token for event delivery to agent session (from `hooks.token` in gateway config)

## Requirements

- OpenClaw Gateway v2026.3+
- Bun (recommended) or Docker
