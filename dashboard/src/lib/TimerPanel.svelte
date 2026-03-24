<script lang="ts">
  import * as Card from '$lib/components/ui/card';
  import * as Table from '$lib/components/ui/table';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import { Modal } from '$lib/components/ui/modal';
  import LogsPanel from '$lib/LogsPanel.svelte';
  import { type TimerJob, createTimer, cancelTimer } from '$lib/api';
  import { relativeAge, formatDuration, isValidAgentSubject } from '$lib/utils';

  interface Props {
    timers: TimerJob[];
    onRefresh: () => void;
  }

  let { timers, onRefresh }: Props = $props();

  // Create form
  let showForm = $state(false);
  let formName = $state('');
  let formDelay = $state('300000');
  let formSubject = $state('agent.events.timer.');
  let formPayload = $state('{}');
  let formError: string | null = $state(null);
  let actionError: string | null = $state(null);
  let loading = $state(false);

  // Modal state
  let selectedTimer: TimerJob | null = $state(null);
  let activeTab: 'details' | 'logs' = $state('details');
  let showDeleteConfirm = $state(false);

  // Delay presets
  const presets = [
    { label: '1m', ms: 60_000 },
    { label: '5m', ms: 300_000 },
    { label: '15m', ms: 900_000 },
    { label: '30m', ms: 1_800_000 },
    { label: '1h', ms: 3_600_000 },
    { label: '6h', ms: 21_600_000 },
  ];

  function resetForm() {
    showForm = false;
    formName = '';
    formDelay = '300000';
    formSubject = 'agent.events.timer.';
    formPayload = '{}';
    formError = null;
  }

  async function handleCreate() {
    formError = null;

    if (!formName.trim()) {
      formError = 'Name is required';
      return;
    }

    const delayMs = parseInt(formDelay);
    if (isNaN(delayMs) || delayMs <= 0) {
      formError = 'Delay must be a positive number (ms)';
      return;
    }

    if (!isValidAgentSubject(formSubject)) {
      formError = 'Subject must start with "agent.events." followed by at least one token and must not end with "."';
      return;
    }

    let parsedPayload: unknown;
    try {
      parsedPayload = JSON.parse(formPayload);
    } catch {
      formError = 'Invalid JSON payload';
      return;
    }

    loading = true;
    try {
      await createTimer({
        name: formName.trim(),
        delayMs,
        subject: formSubject.trim(),
        payload: parsedPayload,
      });
      resetForm();
      onRefresh();
    } catch (e: any) {
      formError = e.message;
    } finally {
      loading = false;
    }
  }

  function openTimerModal(timer: TimerJob) {
    selectedTimer = timer;
    activeTab = 'details';
    showDeleteConfirm = false;
  }

  function closeModal() {
    selectedTimer = null;
    showDeleteConfirm = false;
  }

  async function handleCancel() {
    if (!selectedTimer) return;
    try {
      loading = true;
      await cancelTimer(selectedTimer.name);
      closeModal();
      onRefresh();
    } catch (e: any) {
      actionError = e.message;
    } finally {
      loading = false;
    }
  }

  function statusVariant(timer: TimerJob): 'default' | 'secondary' | 'destructive' {
    if (timer.fired) return 'secondary';
    if (timer.remainingMs <= 0) return 'destructive';
    return 'default';
  }

  function statusLabel(timer: TimerJob): string {
    if (timer.fired) return 'Fired';
    if (timer.remainingMs <= 0) return 'Overdue';
    return 'Pending';
  }
</script>

{#if selectedTimer}
  <Modal
    open={true}
    title="Timer: {selectedTimer.name}"
    onClose={closeModal}
  >
    {#snippet children()}
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
        {#if showDeleteConfirm}
          <div class="rounded-md border border-destructive/50 bg-destructive/5 p-4 space-y-3">
            <p class="text-sm">Cancel timer <span class="font-mono font-semibold">{selectedTimer.name}</span>?</p>
            <p class="text-xs text-muted-foreground">The timer will be removed and will not fire.</p>
            <div class="flex gap-2">
              <Button variant="destructive" size="sm" onclick={handleCancel} disabled={loading}>
                {loading ? 'Cancelling...' : 'Confirm Cancel'}
              </Button>
              <Button variant="outline" size="sm" onclick={() => (showDeleteConfirm = false)}>Back</Button>
            </div>
          </div>
        {:else}
          <div class="space-y-3">
            <div class="grid grid-cols-2 gap-3">
              <div class="space-y-1">
                <span class="text-xs text-muted-foreground">Status</span>
                <div>
                  <Badge variant={statusVariant(selectedTimer)}>{statusLabel(selectedTimer)}</Badge>
                </div>
              </div>
              <div class="space-y-1">
                <span class="text-xs text-muted-foreground">Delay</span>
                <div class="text-sm font-medium">{formatDuration(selectedTimer.delayMs)}</div>
              </div>
            </div>
            <div class="space-y-1">
              <span class="text-xs text-muted-foreground">Subject</span>
              <div class="text-sm font-mono">{selectedTimer.subject}</div>
            </div>
            <div class="space-y-1">
              <span class="text-xs text-muted-foreground">Payload</span>
              <pre class="text-xs font-mono bg-muted/50 rounded-md p-2 overflow-x-auto">{JSON.stringify(selectedTimer.payload, null, 2)}</pre>
            </div>
            <div class="text-xs text-muted-foreground pt-2 space-y-1">
              <div>Created: <span class="font-medium text-foreground">{relativeAge(selectedTimer.createdAt)}</span></div>
              <div>Fire at: <span class="font-medium text-foreground">{new Date(selectedTimer.fireAt).toLocaleString()}</span></div>
              {#if !selectedTimer.fired}
                <div>Remaining: <span class="font-medium text-foreground">{formatDuration(selectedTimer.remainingMs)}</span></div>
              {/if}
            </div>
          </div>
        {/if}
      {:else}
        <LogsPanel entityType="timer" entityId={selectedTimer.id} />
      {/if}
    {/snippet}

    {#snippet actions()}
      {#if activeTab === 'details' && !showDeleteConfirm && !selectedTimer.fired}
        <div class="flex w-full justify-between">
          <Button variant="ghost" size="sm" class="text-destructive" onclick={() => (showDeleteConfirm = true)}>
            Cancel Timer
          </Button>
          <Button variant="outline" size="sm" onclick={closeModal}>Close</Button>
        </div>
      {:else if activeTab === 'details' && !showDeleteConfirm}
        <div class="flex w-full justify-end">
          <Button variant="outline" size="sm" onclick={closeModal}>Close</Button>
        </div>
      {/if}
    {/snippet}
  </Modal>
{/if}

<Card.Root>
  <Card.Header class="pb-2">
    <div class="flex items-center justify-between">
      <Card.Title class="text-sm font-medium">Timers</Card.Title>
      {#if !showForm}
        <Button variant="outline" size="sm" onclick={() => (showForm = true)}>Set Timer</Button>
      {/if}
    </div>
  </Card.Header>
  <Card.Content>
    {#if actionError}
      <div class="rounded-md bg-destructive/10 p-2 text-xs text-destructive mb-2">{actionError}</div>
    {/if}

    {#if showForm}
      <div class="mb-4 space-y-3 rounded-md border p-4">
        {#if formError}
          <div class="rounded-md bg-destructive/10 p-2 text-xs text-destructive">{formError}</div>
        {/if}
        <div>
          <label for="timer-name" class="text-xs text-muted-foreground">Name</label>
          <input
            id="timer-name"
            type="text"
            bind:value={formName}
            placeholder="check-deploy"
            class="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label for="timer-delay" class="text-xs text-muted-foreground">Delay (ms)</label>
          <input
            id="timer-delay"
            type="number"
            min="1000"
            bind:value={formDelay}
            class="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          />
          <div class="flex gap-1.5 mt-1.5">
            {#each presets as preset}
              <button
                class="rounded px-2 py-0.5 text-xs border border-input hover:bg-accent transition-colors {formDelay === String(preset.ms) ? 'bg-accent text-foreground' : 'text-muted-foreground'}"
                onclick={() => (formDelay = String(preset.ms))}
              >{preset.label}</button>
            {/each}
          </div>
        </div>
        <div>
          <label for="timer-subject" class="text-xs text-muted-foreground">Subject</label>
          <input
            id="timer-subject"
            type="text"
            bind:value={formSubject}
            placeholder="agent.events.timer.my-event"
            class="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label for="timer-payload" class="text-xs text-muted-foreground">Payload (JSON)</label>
          <textarea
            id="timer-payload"
            bind:value={formPayload}
            rows="3"
            class="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          ></textarea>
        </div>
        <div class="flex gap-2">
          <Button size="sm" onclick={handleCreate} disabled={loading}>
            {loading ? 'Creating...' : 'Set Timer'}
          </Button>
          <Button variant="ghost" size="sm" onclick={resetForm}>Cancel</Button>
        </div>
      </div>
    {/if}

    {#if timers.length === 0}
      <p class="text-sm text-muted-foreground py-4">No timers</p>
    {:else}
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.Head>Name</Table.Head>
            <Table.Head>Subject</Table.Head>
            <Table.Head>Delay</Table.Head>
            <Table.Head>Status</Table.Head>
            <Table.Head>Remaining</Table.Head>
            <Table.Head>Fire At</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each timers as timer}
            <Table.Row class="cursor-pointer hover:bg-muted/50" onclick={() => openTimerModal(timer)}>
              <Table.Cell class="font-mono text-xs">{timer.name}</Table.Cell>
              <Table.Cell class="font-mono text-xs">{timer.subject}</Table.Cell>
              <Table.Cell class="text-xs">{formatDuration(timer.delayMs)}</Table.Cell>
              <Table.Cell>
                <Badge variant={statusVariant(timer)}>{statusLabel(timer)}</Badge>
              </Table.Cell>
              <Table.Cell class="text-xs text-muted-foreground">
                {timer.fired ? '\u2014' : formatDuration(timer.remainingMs)}
              </Table.Cell>
              <Table.Cell class="text-xs text-muted-foreground">
                {new Date(timer.fireAt).toLocaleString()}
              </Table.Cell>
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    {/if}
  </Card.Content>
</Card.Root>
