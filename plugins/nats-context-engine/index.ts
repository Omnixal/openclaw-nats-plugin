import { publishToSidecar } from '../../hooks/shared/sidecar-client';
import { createDashboardHandler } from './http-handler';

export default function (api: any) {
  // ── Subagent lifecycle ──────────────────────────────────────────────

  api.registerHook('agent:subagent:spawned', async (event: any) => {
    void publishToSidecar('agent.events.subagent.spawned', {
      sessionKey: event.sessionKey,
      subagentId: event.subagentId,
      task: event.task,
      timestamp: new Date().toISOString(),
    });
  }, { name: 'nats-subagent-spawned', description: 'Publish subagent spawn to NATS' });

  api.registerHook('agent:subagent:ended', async (event: any) => {
    void publishToSidecar('agent.events.subagent.ended', {
      sessionKey: event.sessionKey,
      subagentId: event.subagentId,
      result: event.result,
      exitReason: event.exitReason,
      durationMs: event.durationMs,
      timestamp: new Date().toISOString(),
    });
  }, { name: 'nats-subagent-ended', description: 'Publish subagent end to NATS' });

  // ── Session lifecycle ───────────────────────────────────────────────

  api.on('session_start', (event: any) => {
    void publishToSidecar('agent.events.session.started', {
      sessionKey: event.sessionKey,
      sessionId: event.sessionId,
      channel: event.channel,
      timestamp: new Date().toISOString(),
    });
  }, { priority: 99 });

  api.on('session_end', (event: any) => {
    void publishToSidecar('agent.events.session.ended', {
      sessionKey: event.sessionKey,
      sessionId: event.sessionId,
      channel: event.channel,
      timestamp: new Date().toISOString(),
    });
  }, { priority: 99 });

  // ── Agent run lifecycle ─────────────────────────────────────────────

  api.on('agent_end', (event: any) => {
    void publishToSidecar('agent.events.agent.run_ended', {
      sessionKey: event.sessionKey,
      runId: event.runId,
      messageCount: event.messages?.length,
      timestamp: new Date().toISOString(),
    });
  }, { priority: 99 });

  // ── Message delivery ───────────────────────────────────────────────

  api.registerHook('message:sent', async (event: any) => {
    void publishToSidecar('agent.events.message.sent', {
      sessionKey: event.sessionKey,
      to: event.to,
      channelId: event.channelId,
      success: event.success,
      error: event.error,
      messageId: event.messageId,
      timestamp: new Date().toISOString(),
    });
  }, { name: 'nats-message-sent', description: 'Publish message delivery status to NATS' });

  // ── Context compaction ─────────────────────────────────────────────

  api.on('after_compaction', (event: any) => {
    void publishToSidecar('agent.events.context.compacted', {
      sessionKey: event.sessionKey,
      timestamp: new Date().toISOString(),
    }, { priority: 8 });
  }, { priority: 99 });

  // ── Agent Tools ─────────────────────────────────────────────────

  const SIDECAR_URL = process.env.NATS_SIDECAR_URL || 'http://127.0.0.1:3104';
  const SIDECAR_KEY = process.env.NATS_PLUGIN_API_KEY || 'dev-nats-plugin-key';

  const sidecarFetch = async (path: string, options: RequestInit = {}) => {
    const res = await fetch(`${SIDECAR_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SIDECAR_KEY}`,
        ...options.headers,
      },
      signal: AbortSignal.timeout(5000),
    });
    return res.json();
  };

  api.registerTool({
    name: 'nats_publish',
    description: 'Publish an event to the NATS event bus. Use for cron triggers, custom events, task notifications.',
    parameters: {
      type: 'object',
      properties: {
        subject: { type: 'string', description: 'Event subject (must start with agent.events.)' },
        payload: { type: 'object', description: 'Event payload data' },
      },
      required: ['subject', 'payload'],
    },
    async execute(_id: string, params: any) {
      const result = await sidecarFetch('/api/publish', {
        method: 'POST',
        body: JSON.stringify({ subject: params.subject, payload: params.payload }),
      });
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    },
  });

  api.registerTool({
    name: 'nats_subscribe',
    description: 'Subscribe to events matching a pattern. Matched events will be delivered to the target session as messages.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Subject pattern (exact, or wildcard with * for one level, > for all descendants)' },
        target: { type: 'string', description: 'Session key to deliver to (default: main)' },
      },
      required: ['pattern'],
    },
    async execute(_id: string, params: any) {
      const result = await sidecarFetch('/api/routes', {
        method: 'POST',
        body: JSON.stringify({ pattern: params.pattern, target: params.target ?? 'main' }),
      });
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    },
  });

  api.registerTool({
    name: 'nats_unsubscribe',
    description: 'Remove an event subscription by its ID.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Route ID to delete (from nats_subscriptions)' },
      },
      required: ['id'],
    },
    async execute(_id: string, params: any) {
      const result = await sidecarFetch(`/api/routes/${params.id}`, { method: 'DELETE' });
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    },
  });

  api.registerTool({
    name: 'nats_subscriptions',
    description: 'List event subscriptions. Optionally filter by pattern or target session.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Filter: show routes matching this pattern' },
        target: { type: 'string', description: 'Filter: show routes delivering to this session' },
      },
    },
    async execute(_id: string, params: any) {
      const qs = new URLSearchParams();
      if (params?.pattern) qs.set('pattern', params.pattern);
      if (params?.target) qs.set('target', params.target);
      const path = qs.toString() ? `/api/routes?${qs}` : '/api/routes';
      const result = await sidecarFetch(path);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    },
  });

  // ── Dashboard UI ─────────────────────────────────────────────────

  api.registerHttpRoute({
    path: '/nats-dashboard',
    auth: 'plugin',
    match: 'prefix',
    handler: createDashboardHandler(),
  });
}
