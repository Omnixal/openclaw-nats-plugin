import { publishToSidecar } from '../shared/sidecar-client';

// TODO: Add gateway:shutdown hook to publish agent.events.gateway.shutdown
// Pending OpenClaw core support for the gateway:shutdown lifecycle event.

const handler = async (event: any) => {
  if (event.type !== 'gateway' || event.action !== 'startup') return;

  const sidecarUrl = process.env.NATS_SIDECAR_URL || 'http://127.0.0.1:3104';

  try {
    const healthRes = await fetch(`${sidecarUrl}/metrics`, {
      signal: AbortSignal.timeout(5000),
    });

    if (healthRes.ok) {
      const published = await publishToSidecar('agent.events.gateway.startup', {
        sessionKey: event.sessionKey,
        timestamp: new Date().toISOString(),
      });

      if (published) {
        event.messages.push('NATS JetStream connected via sidecar');
      }
    }
  } catch {
    console.warn('[nats-plugin] Sidecar unavailable at startup');
  }
};

export default handler;
