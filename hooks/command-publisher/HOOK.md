---
metadata:
  openclaw:
    events: ["command:new", "command:reset", "command:stop"]
---

# Command Publisher Hook

Publishes session command events to NATS via sidecar:

- `/new` → `agent.events.session.new`
- `/reset` → `agent.events.session.reset`
- `/stop` → `agent.events.session.stop`
