<script lang="ts">
  import * as Card from '$lib/components/ui/card';
  import { Badge } from '$lib/components/ui/badge';
  import type { HealthStatus } from '$lib/api';

  interface Props {
    health: HealthStatus | null;
  }

  let { health }: Props = $props();

  function formatUptime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }
</script>

<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
  <Card.Root>
    <Card.Header class="pb-2">
      <Card.Title class="text-sm font-medium">NATS Server</Card.Title>
    </Card.Header>
    <Card.Content>
      {#if health}
        <Badge variant={health.nats.connected ? 'default' : 'destructive'}>
          {health.nats.connected ? 'Connected' : 'Disconnected'}
        </Badge>
        <p class="text-xs text-muted-foreground mt-2">{health.nats.url}</p>
      {:else}
        <p class="text-sm text-muted-foreground">Loading...</p>
      {/if}
    </Card.Content>
  </Card.Root>

  <Card.Root>
    <Card.Header class="pb-2">
      <Card.Title class="text-sm font-medium">Gateway WebSocket</Card.Title>
    </Card.Header>
    <Card.Content>
      {#if health}
        <Badge variant={health.gateway.connected ? 'default' : 'destructive'}>
          {health.gateway.connected ? 'Connected' : 'Disconnected'}
        </Badge>
        <p class="text-xs text-muted-foreground mt-2">{health.gateway.url}</p>
      {:else}
        <p class="text-sm text-muted-foreground">Loading...</p>
      {/if}
    </Card.Content>
  </Card.Root>

  <Card.Root>
    <Card.Header class="pb-2">
      <Card.Title class="text-sm font-medium">Sidecar</Card.Title>
    </Card.Header>
    <Card.Content>
      {#if health}
        <Badge variant="default">Running</Badge>
        <p class="text-xs text-muted-foreground mt-2">
          Uptime: {formatUptime(health.uptimeSeconds)} · Pending: {health.pendingCount}
        </p>
      {:else}
        <Badge variant="destructive">Unreachable</Badge>
      {/if}
    </Card.Content>
  </Card.Root>
</div>
