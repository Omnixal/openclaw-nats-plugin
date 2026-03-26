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

  // ── Gateway stop ───────────────────────────────────────────────

  api.on('gateway_stop', (event: any) => {
    void publishToSidecar('agent.events.gateway.stopped', {
      reason: event.reason,
      timestamp: new Date().toISOString(),
    });
  }, { priority: 99 });

  // ── Message received ─────────────────────────────────────────────

  api.on('message_received', (event: any) => {
    void publishToSidecar('agent.events.message.received', {
      from: event.from,
      content: event.content,
      metadata: event.metadata,
      timestamp: new Date().toISOString(),
    });
  }, { priority: 99 });

  // ── LLM output ───────────────────────────────────────────────────

  api.on('llm_output', (event: any) => {
    void publishToSidecar('agent.events.llm.output', {
      sessionKey: event.sessionId,
      runId: event.runId,
      provider: event.provider,
      model: event.model,
      usage: event.usage,
      timestamp: new Date().toISOString(),
    });
  }, { priority: 99 });

  // ── Subagent spawning ────────────────────────────────────────────

  api.on('subagent_spawning', (event: any) => {
    void publishToSidecar('agent.events.subagent.spawning', {
      childSessionKey: event.childSessionKey,
      agentId: event.agentId,
      label: event.label,
      mode: event.mode,
      timestamp: new Date().toISOString(),
    });
    return { status: 'ok' };
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
        payload: { type: 'object', description: 'Additional context payload that will be merged with event data on delivery' },
      },
      required: ['pattern'],
    },
    async execute(_id: string, params: any) {
      const result = await sidecarFetch('/api/routes', {
        method: 'POST',
        body: JSON.stringify({ pattern: params.pattern, target: params.target ?? 'main', payload: params.payload }),
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

  // ── Cron Scheduler Tools ────────────────────────────────────────────

  api.registerTool({
    name: 'nats_cron_add',
    description: 'Create or update a scheduled cron job that publishes a NATS event on a schedule. No LLM wake — fires directly.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Unique job name (e.g., daily-report, hourly-check)' },
        cron: { type: 'string', description: 'Cron expression (e.g., "0 9 * * *" for daily at 9am)' },
        subject: { type: 'string', description: 'NATS subject to publish (must start with agent.events.)' },
        payload: { type: 'object', description: 'Event payload data' },
        timezone: { type: 'string', description: 'Timezone (default: UTC). e.g., Europe/Moscow' },
      },
      required: ['name', 'cron', 'subject'],
    },
    async execute(_id: string, params: any) {
      const result = await sidecarFetch('/api/cron', {
        method: 'POST',
        body: JSON.stringify({
          name: params.name,
          cron: params.cron,
          subject: params.subject,
          payload: params.payload ?? {},
          timezone: params.timezone,
        }),
      });
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    },
  });

  api.registerTool({
    name: 'nats_cron_remove',
    description: 'Remove a scheduled cron job by name.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Job name to remove' },
      },
      required: ['name'],
    },
    async execute(_id: string, params: any) {
      const result = await sidecarFetch(`/api/cron/${encodeURIComponent(params.name)}`, {
        method: 'DELETE',
      });
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    },
  });

  api.registerTool({
    name: 'nats_cron_list',
    description: 'List all scheduled cron jobs with their next run time and status.',
    parameters: { type: 'object', properties: {} },
    async execute() {
      const result = await sidecarFetch('/api/cron');
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    },
  });

  api.registerTool({
    name: 'nats_cron_update',
    description: 'Update an existing cron job. Can change schedule, subject, payload, timezone, or enabled status.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Job name to update' },
        cron: { type: 'string', description: 'New cron expression' },
        subject: { type: 'string', description: 'New NATS subject' },
        payload: { type: 'object', description: 'New event payload' },
        timezone: { type: 'string', description: 'New timezone' },
        enabled: { type: 'boolean', description: 'Enable or disable the job' },
      },
      required: ['name'],
    },
    async execute(_id: string, params: any) {
      const { name, ...fields } = params;
      const result = await sidecarFetch(`/api/cron/${encodeURIComponent(name)}`, {
        method: 'PATCH',
        body: JSON.stringify(fields),
      });
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    },
  });

  api.registerTool({
    name: 'nats_cron_toggle',
    description: 'Toggle a cron job on/off.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Job name to toggle' },
      },
      required: ['name'],
    },
    async execute(_id: string, params: any) {
      const result = await sidecarFetch(`/api/cron/${encodeURIComponent(params.name)}/toggle`, {
        method: 'PATCH',
      });
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    },
  });

  api.registerTool({
    name: 'nats_cron_run',
    description: 'Manually fire a cron job right now (does not affect its schedule).',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Job name to fire' },
      },
      required: ['name'],
    },
    async execute(_id: string, params: any) {
      const result = await sidecarFetch(`/api/cron/${encodeURIComponent(params.name)}/run`, {
        method: 'POST',
      });
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    },
  });

  // ── Route Management Tools ────────────────────────────────────────

  api.registerTool({
    name: 'nats_route_update',
    description: 'Update an existing route subscription. Can change target session, priority, enabled status, or custom payload.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Route ID (from nats_subscriptions)' },
        target: { type: 'string', description: 'New target session' },
        priority: { type: 'number', description: 'New priority (1-10)' },
        enabled: { type: 'boolean', description: 'Enable or disable the route' },
        payload: { type: 'object', description: 'New custom payload to merge with event data on delivery' },
      },
      required: ['id'],
    },
    async execute(_id: string, params: any) {
      const { id, ...fields } = params;
      const result = await sidecarFetch(`/api/routes/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(fields),
      });
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    },
  });

  // ── Timer (One-Shot Delayed) Tools ────────────────────────────────

  api.registerTool({
    name: 'nats_timer_set',
    description: 'Set a one-shot timer that publishes a NATS event after a delay. Use for delayed self-pings, reminders, or deferred tasks. Survives sidecar restarts.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Unique timer name (e.g., check-deploy-status, reminder-followup)' },
        delayMs: { type: 'number', description: 'Delay in milliseconds before firing (e.g., 300000 for 5 minutes)' },
        subject: { type: 'string', description: 'NATS subject to publish (must start with agent.events.)' },
        payload: { type: 'object', description: 'Event payload data' },
      },
      required: ['name', 'delayMs', 'subject'],
    },
    async execute(_id: string, params: any) {
      const result = await sidecarFetch('/api/cron/timer', {
        method: 'POST',
        body: JSON.stringify({
          name: params.name,
          delayMs: params.delayMs,
          subject: params.subject,
          payload: params.payload ?? {},
        }),
      });
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    },
  });

  api.registerTool({
    name: 'nats_timer_cancel',
    description: 'Cancel a pending timer by name.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Timer name to cancel' },
      },
      required: ['name'],
    },
    async execute(_id: string, params: any) {
      const result = await sidecarFetch(`/api/cron/timer/${encodeURIComponent(params.name)}`, {
        method: 'DELETE',
      });
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    },
  });

  api.registerTool({
    name: 'nats_timer_list',
    description: 'List all timers (pending and fired) with remaining time.',
    parameters: { type: 'object', properties: {} },
    async execute() {
      const result = await sidecarFetch('/api/cron/timer');
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
