<script lang="ts">
  import * as Card from '$lib/components/ui/card';
  import * as Table from '$lib/components/ui/table';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import { Modal } from '$lib/components/ui/modal';
  import LogsPanel from '$lib/LogsPanel.svelte';
  import { type EventRoute, createRoute, deleteRoute, updateRoute } from '$lib/api';
  import { relativeAge, formatDuration, isValidAgentSubject } from '$lib/utils';

  interface Props {
    routes: EventRoute[];
    onRefresh: () => void;
  }

  let { routes, onRefresh }: Props = $props();

  // Create form state
  let showForm: boolean = $state(false);
  let formPattern: string = $state('agent.events.');
  let formTarget: string = $state('main');
  let formPriority: number = $state(5);
  let formError: string | null = $state(null);
  let actionError: string | null = $state(null);
  let loading: boolean = $state(false);

  // Modal state
  let selectedRoute: EventRoute | null = $state(null);
  let activeTab: 'details' | 'logs' = $state('details');
  let editTarget: string = $state('');
  let editPriority: number = $state(5);
  let editEnabled: boolean = $state(true);
  let editError: string | null = $state(null);
  let showDeleteConfirm: boolean = $state(false);

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
    if (!isValidAgentSubject(formPattern)) {
      formError = 'Pattern must start with "agent.events." followed by at least one token and must not end with "."';
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

  function openRouteModal(route: EventRoute) {
    selectedRoute = route;
    activeTab = 'details';
    editTarget = route.target;
    editPriority = route.priority;
    editEnabled = route.enabled;
    editError = null;
    showDeleteConfirm = false;
  }

  function closeModal() {
    selectedRoute = null;
    editError = null;
    showDeleteConfirm = false;
  }

  async function handleSave() {
    if (!selectedRoute) return;
    try {
      editError = null;
      loading = true;
      await updateRoute(selectedRoute.id, {
        target: editTarget,
        priority: editPriority,
        enabled: editEnabled,
      });
      closeModal();
      onRefresh();
    } catch (e: any) {
      editError = e.message;
    } finally {
      loading = false;
    }
  }

  async function handleDelete() {
    if (!selectedRoute) return;
    try {
      editError = null;
      loading = true;
      await deleteRoute(selectedRoute.id);
      closeModal();
      onRefresh();
    } catch (e: any) {
      editError = e.message;
    } finally {
      loading = false;
    }
  }
</script>

{#if selectedRoute}
  <Modal
    open={true}
    title="Route: {selectedRoute.pattern}"
    onClose={closeModal}
  >
    {#snippet children()}
      <!-- Tabs -->
      <div class="flex gap-1 border-b mb-4">
        <button
          class="px-3 py-1.5 text-sm font-medium border-b-2 transition-colors {activeTab === 'details' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}"
          onclick={() => (activeTab = 'details')}
        >Details</button>
        <button
          class="px-3 py-1.5 text-sm font-medium border-b-2 transition-colors {activeTab === 'logs' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}"
          onclick={() => (activeTab = 'logs')}
        >Logs</button>
      </div>

      {#if activeTab === 'details'}
        {#if editError}
          <div class="rounded-md bg-destructive/10 p-2 text-xs text-destructive mb-3">{editError}</div>
        {/if}

        {#if showDeleteConfirm}
          <div class="rounded-md border border-destructive/50 bg-destructive/5 p-4 space-y-3">
            <p class="text-sm">Are you sure you want to delete route <span class="font-mono font-semibold">{selectedRoute.pattern}</span>?</p>
            <p class="text-xs text-muted-foreground">This action cannot be undone.</p>
            <div class="flex gap-2">
              <Button variant="destructive" size="sm" onclick={handleDelete} disabled={loading}>
                {loading ? 'Deleting...' : 'Confirm Delete'}
              </Button>
              <Button variant="outline" size="sm" onclick={() => (showDeleteConfirm = false)}>Cancel</Button>
            </div>
          </div>
        {:else}
          <div class="space-y-3">
            <div class="space-y-1">
              <label class="text-xs text-muted-foreground" for="edit-target">Target</label>
              <input
                id="edit-target"
                type="text"
                bind:value={editTarget}
                class="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
              />
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div class="space-y-1">
                <label class="text-xs text-muted-foreground" for="edit-priority">Priority</label>
                <input
                  id="edit-priority"
                  type="number"
                  min="1"
                  max="10"
                  bind:value={editPriority}
                  class="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                />
              </div>
              <div class="space-y-1">
                <label for="edit-enabled" class="text-xs text-muted-foreground">Enabled</label>
                <div class="flex items-center gap-2 pt-1">
                  <input id="edit-enabled" type="checkbox" bind:checked={editEnabled} />
                  <label for="edit-enabled" class="text-sm">{editEnabled ? 'Active' : 'Disabled'}</label>
                </div>
              </div>
            </div>

            <div class="text-xs text-muted-foreground pt-2 space-y-1">
              <div>Deliveries: <span class="font-medium text-foreground">{selectedRoute.deliveryCount}</span></div>
              <div>Last delivered: <span class="font-medium text-foreground">{selectedRoute.lastDeliveredAt ? relativeAge(new Date(selectedRoute.lastDeliveredAt).getTime()) : '\u2014'}</span></div>
              {#if selectedRoute.lastEventSubject}
                <div>Last subject: <span class="font-mono font-medium text-foreground">{selectedRoute.lastEventSubject}</span></div>
              {/if}
            </div>
          </div>
        {/if}
      {:else}
        <LogsPanel entityType="route" entityId={selectedRoute.id} />
      {/if}
    {/snippet}

    {#snippet actions()}
      {#if activeTab === 'details' && !showDeleteConfirm}
        <div class="flex w-full justify-between">
          <Button variant="ghost" size="sm" class="text-destructive" onclick={() => (showDeleteConfirm = true)}>
            Delete
          </Button>
          <div class="flex gap-2">
            <Button variant="outline" size="sm" onclick={closeModal}>Cancel</Button>
            <Button size="sm" onclick={handleSave} disabled={loading}>
              {loading ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      {/if}
    {/snippet}
  </Modal>
{/if}

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
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each routes as route}
            <Table.Row class="cursor-pointer hover:bg-muted/50" onclick={() => openRouteModal(route)}>
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
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    {/if}
  </Card.Content>
</Card.Root>
