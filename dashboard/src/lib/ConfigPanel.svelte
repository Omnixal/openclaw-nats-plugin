<script lang="ts">
  import * as Card from '$lib/components/ui/card';
  import { Badge } from '$lib/components/ui/badge';
  import type { HealthStatus } from '$lib/api';

  interface Props {
    health: HealthStatus | null;
  }

  let { health }: Props = $props();
</script>

{#if health}
  <Card.Root>
    <Card.Header class="pb-2">
      <Card.Title class="text-sm font-medium">Configuration</Card.Title>
    </Card.Header>
    <Card.Content class="space-y-2 text-sm">
      <div>
        <span class="text-muted-foreground">Streams:</span>
        {#each health.config.streams as stream}
          <Badge variant="secondary" class="ml-1">{stream}</Badge>
        {/each}
      </div>
      <div>
        <span class="text-muted-foreground">Consumer:</span>
        <code class="ml-1">{health.config.consumerName}</code>
      </div>
      <div>
        <span class="text-muted-foreground">Dedup TTL:</span>
        <code class="ml-1">{health.config.dedupTtlSeconds}s</code>
      </div>
    </Card.Content>
  </Card.Root>
{/if}
