<script lang="ts">
  import { Modal } from '$lib/components/ui/modal';
  import * as Table from '$lib/components/ui/table';

  interface Props {
    open: boolean;
    onClose: () => void;
  }

  let { open, onClose }: Props = $props();

  const events = [
    { subject: 'agent.events.gateway.startup', trigger: 'Gateway started', payload: '{}' },
    { subject: 'agent.events.gateway.stopped', trigger: 'Gateway stopped', payload: '{ reason }' },
    { subject: 'agent.events.session.new', trigger: '/new command', payload: '{ sessionKey, command }' },
    { subject: 'agent.events.session.reset', trigger: '/reset command', payload: '{ sessionKey, command }' },
    { subject: 'agent.events.session.stop', trigger: '/stop command', payload: '{ sessionKey, command }' },
    { subject: 'agent.events.session.started', trigger: 'Session began', payload: '{ sessionKey, sessionId, channel }' },
    { subject: 'agent.events.session.ended', trigger: 'Session ended', payload: '{ sessionKey, sessionId, channel }' },
    { subject: 'agent.events.agent.run_ended', trigger: 'Agent run completed', payload: '{ sessionKey, runId, messageCount }' },
    { subject: 'agent.events.tool.{name}.completed', trigger: 'Tool succeeded', payload: '{ sessionKey, toolName, durationMs }' },
    { subject: 'agent.events.tool.{name}.failed', trigger: 'Tool failed', payload: '{ sessionKey, toolName, durationMs }' },
    { subject: 'agent.events.message.received', trigger: 'Inbound message', payload: '{ from, content, metadata }' },
    { subject: 'agent.events.message.sent', trigger: 'Message delivered', payload: '{ sessionKey, to, success, error }' },
    { subject: 'agent.events.llm.output', trigger: 'LLM response', payload: '{ provider, model, usage }' },
    { subject: 'agent.events.subagent.spawning', trigger: 'Subagent creating', payload: '{ childSessionKey, agentId, label, mode }' },
    { subject: 'agent.events.subagent.spawned', trigger: 'Subagent created', payload: '{ sessionKey, subagentId, task }' },
    { subject: 'agent.events.subagent.ended', trigger: 'Subagent finished', payload: '{ sessionKey, subagentId, result, durationMs }' },
    { subject: 'agent.events.context.compacted', trigger: 'Context compressed', payload: '{ sessionKey }' },
    { subject: 'agent.events.cron.*', trigger: 'Cron trigger', payload: '(user-defined)' },
    { subject: 'agent.events.custom.*', trigger: 'Custom event', payload: '(user-defined)' },
  ];
</script>

<Modal {open} title="Events Reference" {onClose} class="max-w-3xl">
  <div class="max-h-[60vh] overflow-y-auto -mx-6 px-6">
    <p class="text-xs text-muted-foreground mb-3">
      All events published by the NATS plugin. Each event also includes a <code class="text-xs">timestamp</code> field.
    </p>
    <Table.Root>
      <Table.Header>
        <Table.Row>
          <Table.Head>Subject</Table.Head>
          <Table.Head>Trigger</Table.Head>
          <Table.Head>Payload</Table.Head>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {#each events as ev}
          <Table.Row>
            <Table.Cell class="font-mono text-xs whitespace-nowrap">{ev.subject}</Table.Cell>
            <Table.Cell class="text-xs">{ev.trigger}</Table.Cell>
            <Table.Cell class="font-mono text-xs text-muted-foreground">{ev.payload}</Table.Cell>
          </Table.Row>
        {/each}
      </Table.Body>
    </Table.Root>
  </div>
</Modal>
