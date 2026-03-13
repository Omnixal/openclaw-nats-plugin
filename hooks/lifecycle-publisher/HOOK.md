---
metadata:
  openclaw:
    events: ["tool_result_persist"]
---

# Lifecycle Publisher Hook

Publishes tool completion/failure events to NATS via sidecar.

- `agent.events.tool.{toolName}.completed` — when a tool succeeds
- `agent.events.tool.{toolName}.failed` — when a tool fails
