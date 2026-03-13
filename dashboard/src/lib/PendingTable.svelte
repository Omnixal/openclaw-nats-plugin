<script lang="ts">
  import * as Table from '$lib/components/ui/table';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import { type PendingEvent, markDelivered } from '$lib/api';

  interface Props {
    events: PendingEvent[];
    onRefresh: () => void;
  }

  let { events, onRefresh }: Props = $props();

  function relativeAge(ts: number): string {
    const seconds = Math.floor((Date.now() - ts) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
  }

  function priorityVariant(p: number): 'default' | 'secondary' | 'destructive' {
    if (p >= 8) return 'destructive';
    if (p >= 5) return 'default';
    return 'secondary';
  }

  let ackError: string | null = $state(null);

  async function ack(id: string) {
    try {
      ackError = null;
      await markDelivered([id]);
      onRefresh();
    } catch (e: any) {
      ackError = e.message;
    }
  }
</script>

{#if ackError}
  <div class="rounded-md bg-destructive/10 p-2 text-xs text-destructive mb-2">{ackError}</div>
{/if}

{#if events.length === 0}
  <p class="text-sm text-muted-foreground py-4">No pending events</p>
{:else}
  <Table.Root>
    <Table.Header>
      <Table.Row>
        <Table.Head>Subject</Table.Head>
        <Table.Head>Priority</Table.Head>
        <Table.Head>Age</Table.Head>
        <Table.Head class="w-16"></Table.Head>
      </Table.Row>
    </Table.Header>
    <Table.Body>
      {#each events as event}
        <Table.Row>
          <Table.Cell class="font-mono text-xs">{event.subject}</Table.Cell>
          <Table.Cell>
            <Badge variant={priorityVariant(event.priority)}>{event.priority}</Badge>
          </Table.Cell>
          <Table.Cell class="text-xs text-muted-foreground">
            {relativeAge(event.createdAt)}
          </Table.Cell>
          <Table.Cell>
            <Button variant="ghost" size="sm" onclick={() => ack(event.id)}>Ack</Button>
          </Table.Cell>
        </Table.Row>
      {/each}
    </Table.Body>
  </Table.Root>
{/if}
