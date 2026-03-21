<script lang="ts">
  import { onMount } from 'svelte';
  import {
    getHealth, getPending, getRoutes, getCronJobs, getMetrics,
    type HealthStatus, type PendingEvent, type EventRoute, type CronJob, type SubjectMetric,
  } from '$lib/api';
  import HealthCards from '$lib/HealthCards.svelte';
  import PendingTable from '$lib/PendingTable.svelte';
  import ConfigPanel from '$lib/ConfigPanel.svelte';
  import RoutesPanel from '$lib/RoutesPanel.svelte';
  import CronPanel from '$lib/CronPanel.svelte';
  import MetricsPanel from '$lib/MetricsPanel.svelte';
  import ThemeToggle from '$lib/ThemeToggle.svelte';
  import RefreshCw from '@lucide/svelte/icons/refresh-cw';

  let health: HealthStatus | null = $state(null);
  let pending: PendingEvent[] = $state([]);
  let routes: EventRoute[] = $state([]);
  let cronJobs: CronJob[] = $state([]);
  let metrics: SubjectMetric[] = $state([]);
  let error: string | null = $state(null);
  let activeTab: 'pending' | 'routes' | 'cron' | 'metrics' = $state('pending');

  const tabs = [
    { id: 'pending' as const, label: 'Pending' },
    { id: 'routes' as const, label: 'Routes' },
    { id: 'cron' as const, label: 'Cron Jobs' },
    { id: 'metrics' as const, label: 'Metrics' },
  ];

  async function refresh() {
    try {
      error = null;
      const [h, p, r, c, m] = await Promise.all([
        getHealth(),
        getPending('default'),
        getRoutes(),
        getCronJobs(),
        getMetrics(),
      ]);
      health = h;
      pending = p;
      routes = r;
      cronJobs = c;
      metrics = m;
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

<main class="min-h-screen bg-background p-6 max-w-5xl mx-auto" style="animation: rise 0.3s cubic-bezier(0.16, 1, 0.3, 1)">
  <div class="flex items-center justify-between mb-6">
    <h1 class="text-2xl font-bold text-foreground tracking-tight">NATS Dashboard</h1>
    <div class="flex items-center gap-3">
      <button
        class="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground hover:bg-accent"
        onclick={refresh}
      >
        <RefreshCw size={14} />
        Refresh
      </button>
      <ThemeToggle />
    </div>
  </div>

  {#if error}
    <div class="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive mb-4">
      {error}
    </div>
  {/if}

  <div class="space-y-6">
    <HealthCards {health} />

    <div class="flex gap-1 border-b border-border">
      {#each tabs as tab}
        <button
          class="px-4 py-2.5 text-sm font-medium transition-all {activeTab === tab.id
            ? 'border-b-2 border-primary text-foreground'
            : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'}"
          onclick={() => activeTab = tab.id}
        >
          {tab.label}
        </button>
      {/each}
    </div>

    {#if activeTab === 'pending'}
      <PendingTable events={pending} onRefresh={refresh} />
    {:else if activeTab === 'routes'}
      <RoutesPanel {routes} onRefresh={refresh} />
    {:else if activeTab === 'cron'}
      <CronPanel jobs={cronJobs} onRefresh={refresh} />
    {:else if activeTab === 'metrics'}
      <MetricsPanel {metrics} />
    {/if}

    <ConfigPanel {health} />
  </div>
</main>
