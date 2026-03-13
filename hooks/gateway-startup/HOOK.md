---
metadata:
  openclaw:
    events: ["gateway:startup"]
    env:
      NATS_SIDECAR_URL: optional
      NATS_PLUGIN_API_KEY: optional
---

# Gateway Startup Hook

Publishes `agent.events.gateway.startup` event to NATS via sidecar when the OpenClaw Gateway starts.
Also verifies sidecar connectivity.
