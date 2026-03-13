<script lang="ts">
  import { onMount } from 'svelte';
  import { getHealth, getPending, type HealthStatus, type PendingEvent } from '$lib/api';
  import HealthCards from '$lib/HealthCards.svelte';
  import PendingTable from '$lib/PendingTable.svelte';
  import ConfigPanel from '$lib/ConfigPanel.svelte';

  let health: HealthStatus | null = $state(null);
  let pending: PendingEvent[] = $state([]);
  let error: string | null = $state(null);

  async function refresh() {
    try {
      error = null;
      const [h, p] = await Promise.all([
        getHealth(),
        getPending('default'),
      ]);
      health = h;
      pending = p;
    } catch (e: any) {
      error = e.message;
    }
  }

  onMount(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  });
</script>

<main class="min-h-screen bg-background p-6 max-w-4xl mx-auto">
  <div class="flex items-center justify-between mb-6">
    <h1 class="text-2xl font-bold">NATS Dashboard</h1>
    <button
      class="text-sm text-muted-foreground hover:text-foreground"
      onclick={refresh}
    >
      Refresh
    </button>
  </div>

  {#if error}
    <div class="rounded-md bg-destructive/10 p-3 text-sm text-destructive mb-4">
      {error}
    </div>
  {/if}

  <div class="space-y-6">
    <HealthCards {health} />

    <div>
      <h2 class="text-lg font-semibold mb-3">Pending Events</h2>
      <PendingTable events={pending} onRefresh={refresh} />
    </div>

    <ConfigPanel {health} />
  </div>
</main>
