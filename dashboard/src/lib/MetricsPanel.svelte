<script lang="ts">
  import * as Table from '$lib/components/ui/table';
  import { Badge } from '$lib/components/ui/badge';
  import * as Card from '$lib/components/ui/card';
  import type { SubjectMetric } from '$lib/api';
  import { relativeAge } from '$lib/utils';

  interface Props {
    metrics: SubjectMetric[];
  }

  let { metrics }: Props = $props();

  let totalPublished = $derived(metrics.reduce((acc, m) => acc + m.published, 0));
  let totalConsumed = $derived(metrics.reduce((acc, m) => acc + m.consumed, 0));
</script>

<Card.Root>
  <Card.Header class="pb-2">
    <Card.Title class="text-sm font-medium">Queue Metrics</Card.Title>
  </Card.Header>
  <Card.Content>
    <div class="flex items-center gap-2 mb-3">
      <Badge variant="default">Published: {totalPublished}</Badge>
      <Badge variant="secondary">Consumed: {totalConsumed}</Badge>
    </div>
    <p class="text-xs text-muted-foreground mb-3">Counters reset on sidecar restart</p>

    {#if metrics.length === 0}
      <p class="text-sm text-muted-foreground py-4">No metrics yet — publish or consume events to see counts</p>
    {:else}
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.Head>Subject</Table.Head>
            <Table.Head class="text-right">Published</Table.Head>
            <Table.Head class="text-right">Consumed</Table.Head>
            <Table.Head>Last Published</Table.Head>
            <Table.Head>Last Consumed</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each metrics as metric}
            <Table.Row>
              <Table.Cell class="font-mono text-xs">{metric.subject}</Table.Cell>
              <Table.Cell class="text-right">{metric.published}</Table.Cell>
              <Table.Cell class="text-right">{metric.consumed}</Table.Cell>
              <Table.Cell class="text-xs text-muted-foreground">
                {relativeAge(metric.lastPublishedAt)}
              </Table.Cell>
              <Table.Cell class="text-xs text-muted-foreground">
                {relativeAge(metric.lastConsumedAt)}
              </Table.Cell>
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    {/if}
  </Card.Content>
</Card.Root>
