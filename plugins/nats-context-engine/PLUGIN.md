# NATS Context Engine Plugin

Publishes subagent lifecycle events to NATS via the sidecar service.

## Events Published

- `agent.events.subagent.spawned` — when a subagent is spawned
- `agent.events.subagent.ended` — when a subagent completes

## Configuration

Uses the same environment variables as hooks:
- `NATS_SIDECAR_URL` — sidecar URL (default: `http://nats-sidecar:3104`)
- `NATS_PLUGIN_API_KEY` — authentication key
