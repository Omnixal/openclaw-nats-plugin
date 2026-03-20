<script lang="ts">
  import * as Card from '$lib/components/ui/card';
  import * as Table from '$lib/components/ui/table';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import { type EventRoute, createRoute, deleteRoute } from '$lib/api';
  import { relativeAge, formatDuration } from '$lib/utils';

  interface Props {
    routes: EventRoute[];
    onRefresh: () => void;
  }

  let { routes, onRefresh }: Props = $props();

  let showForm: boolean = $state(false);
  let formPattern: string = $state('agent.events.');
  let formTarget: string = $state('main');
  let formPriority: number = $state(5);
  let formError: string | null = $state(null);
  let actionError: string | null = $state(null);
  let loading: boolean = $state(false);

  function priorityVariant(p: number): 'default' | 'secondary' | 'destructive' {
    if (p >= 8) return 'destructive';
    if (p >= 5) return 'default';
    return 'secondary';
  }

  function resetForm() {
    formPattern = 'agent.events.';
    formTarget = 'main';
    formPriority = 5;
    formError = null;
    showForm = false;
  }

  async function handleCreate() {
    formError = null;
    if (!formPattern.startsWith('agent.events.')) {
      formError = 'Pattern must start with "agent.events."';
      return;
    }
    try {
      loading = true;
      await createRoute({
        pattern: formPattern,
        target: formTarget || undefined,
        priority: formPriority,
      });
      resetForm();
      onRefresh();
    } catch (e: any) {
      formError = e.message;
    } finally {
      loading = false;
    }
  }

  async function handleDelete(id: string) {
    try {
      actionError = null;
      loading = true;
      await deleteRoute(id);
      onRefresh();
    } catch (e: any) {
      actionError = e.message;
    } finally {
      loading = false;
    }
  }
</script>

<Card.Root>
  <Card.Header class="pb-2 flex flex-row items-center justify-between">
    <Card.Title class="text-sm font-medium">Routes</Card.Title>
    <Button variant="outline" size="sm" onclick={() => (showForm = !showForm)}>
      {showForm ? 'Cancel' : '+ New Route'}
    </Button>
  </Card.Header>
  <Card.Content>
    {#if actionError}
      <div class="rounded-md bg-destructive/10 p-2 text-xs text-destructive mb-2">{actionError}</div>
    {/if}

    {#if showForm}
      <div class="rounded-md border p-3 mb-4 space-y-3">
        {#if formError}
          <div class="rounded-md bg-destructive/10 p-2 text-xs text-destructive">{formError}</div>
        {/if}
        <div class="space-y-1">
          <label class="text-xs text-muted-foreground" for="route-pattern">Pattern</label>
          <input
            id="route-pattern"
            type="text"
            bind:value={formPattern}
            class="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            placeholder="agent.events.>"
          />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1">
            <label class="text-xs text-muted-foreground" for="route-target">Target</label>
            <input
              id="route-target"
              type="text"
              bind:value={formTarget}
              class="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
              placeholder="main"
            />
          </div>
          <div class="space-y-1">
            <label class="text-xs text-muted-foreground" for="route-priority">Priority</label>
            <input
              id="route-priority"
              type="number"
              min="1"
              max="10"
              bind:value={formPriority}
              class="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            />
          </div>
        </div>
        <div class="flex gap-2">
          <Button size="sm" onclick={handleCreate} disabled={loading}>
            {loading ? 'Creating...' : 'Create'}
          </Button>
          <Button variant="ghost" size="sm" onclick={resetForm}>Cancel</Button>
        </div>
      </div>
    {/if}

    {#if routes.length === 0}
      <p class="text-sm text-muted-foreground py-4">No routes configured</p>
    {:else}
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.Head>Pattern</Table.Head>
            <Table.Head>Target</Table.Head>
            <Table.Head>Priority</Table.Head>
            <Table.Head>Enabled</Table.Head>
            <Table.Head>Deliveries</Table.Head>
            <Table.Head>Last Delivered</Table.Head>
            <Table.Head>Lag</Table.Head>
            <Table.Head class="w-16"></Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each routes as route}
            <Table.Row>
              <Table.Cell class="font-mono text-xs">{route.pattern}</Table.Cell>
              <Table.Cell>{route.target}</Table.Cell>
              <Table.Cell>
                <Badge variant={priorityVariant(route.priority)}>{route.priority}</Badge>
              </Table.Cell>
              <Table.Cell>
                <Badge variant={route.enabled ? 'default' : 'secondary'}>
                  {route.enabled ? 'on' : 'off'}
                </Badge>
              </Table.Cell>
              <Table.Cell>{route.deliveryCount}</Table.Cell>
              <Table.Cell class="text-xs text-muted-foreground">
                {route.lastDeliveredAt ? relativeAge(new Date(route.lastDeliveredAt).getTime()) : '\u2014'}
              </Table.Cell>
              <Table.Cell class="text-xs text-muted-foreground">
                {formatDuration(route.lagMs)}
              </Table.Cell>
              <Table.Cell>
                <Button variant="ghost" size="sm" onclick={() => handleDelete(route.id)}>Delete</Button>
              </Table.Cell>
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    {/if}
  </Card.Content>
</Card.Root>
