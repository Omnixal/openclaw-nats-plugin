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

  // ── Dashboard UI ─────────────────────────────────────────────────

  api.registerHttpRoute({
    path: '/nats-dashboard',
    auth: 'plugin',
    match: 'prefix',
    handler: createDashboardHandler(),
  });
}
