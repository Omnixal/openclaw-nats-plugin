<script lang="ts">
  import * as Card from '$lib/components/ui/card';
  import * as Table from '$lib/components/ui/table';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import { Modal } from '$lib/components/ui/modal';
  import LogsPanel from '$lib/LogsPanel.svelte';
  import {
    type CronJob,
    createCronJob,
    deleteCronJob,
    toggleCronJob,
    runCronJobNow,
    updateCronJob,
  } from '$lib/api';
  import { relativeAge, isValidAgentSubject } from '$lib/utils';

  interface Props {
    jobs: CronJob[];
    onRefresh: () => void;
  }

  let { jobs, onRefresh }: Props = $props();

  // Create form
  let showForm = $state(false);
  let formName = $state('');
  let formCron = $state('0 9 * * *');
  let formSubject = $state('agent.events.');
  let formPayload = $state('{}');
  let formTimezone = $state('UTC');
  let formError: string | null = $state(null);
  let actionError: string | null = $state(null);
  let loading = $state(false);

  // Modal state
  let selectedJob: CronJob | null = $state(null);
  let activeTab: 'details' | 'logs' = $state('details');
  let editCron = $state('');
  let editSubject = $state('');
  let editPayload = $state('');
  let editTimezone = $state('');
  let editEnabled = $state(true);
  let editError: string | null = $state(null);
  let showDeleteConfirm = $state(false);

  function formatNextRun(iso: string): string {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  }

  function resetForm() {
    showForm = false;
    formName = '';
    formCron = '0 9 * * *';
    formSubject = 'agent.events.';
    formPayload = '{}';
    formTimezone = 'UTC';
    formError = null;
  }

  async function handleCreate() {
    formError = null;

    if (!formName.trim()) {
      formError = 'Name is required';
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
      await createCronJob({
        name: formName.trim(),
        cron: formCron.trim(),
        subject: formSubject.trim(),
        payload: parsedPayload,
        timezone: formTimezone.trim(),
      });
      resetForm();
      onRefresh();
    } catch (e: any) {
      formError = e.message;
    } finally {
      loading = false;
    }
  }

  function openJobModal(job: CronJob) {
    selectedJob = job;
    activeTab = 'details';
    editCron = job.expr;
    editSubject = job.subject;
    editPayload = job.payload ? JSON.stringify(job.payload, null, 2) : '{}';
    editTimezone = job.timezone;
    editEnabled = job.enabled;
    editError = null;
    showDeleteConfirm = false;
  }

  function closeModal() {
    selectedJob = null;
    editError = null;
    showDeleteConfirm = false;
  }

  async function handleSave() {
    if (!selectedJob) return;

    if (!isValidAgentSubject(editSubject)) {
      editError = 'Subject must start with "agent.events." followed by at least one token';
      return;
    }

    let parsedPayload: unknown;
    try {
      parsedPayload = JSON.parse(editPayload);
    } catch {
      editError = 'Invalid JSON payload';
      return;
    }

    try {
      editError = null;
      loading = true;
      await updateCronJob(selectedJob.name, {
        cron: editCron,
        subject: editSubject,
        payload: parsedPayload,
        timezone: editTimezone,
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

  async function handleToggle(name: string, e: MouseEvent) {
    e.stopPropagation();
    try {
      actionError = null;
      await toggleCronJob(name);
      onRefresh();
    } catch (err: any) {
      actionError = err.message;
    }
  }

  async function handleRun(name: string, e: MouseEvent) {
    e.stopPropagation();
    try {
      actionError = null;
      await runCronJobNow(name);
      onRefresh();
    } catch (err: any) {
      actionError = err.message;
    }
  }

  async function handleDelete() {
    if (!selectedJob) return;
    try {
      editError = null;
      loading = true;
      await deleteCronJob(selectedJob.name);
      closeModal();
      onRefresh();
    } catch (e: any) {
      editError = e.message;
    } finally {
      loading = false;
    }
  }
</script>

{#if selectedJob}
  <Modal
    open={true}
    title="Cron Job: {selectedJob.name}"
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
            <p class="text-sm">Are you sure you want to delete cron job <span class="font-mono font-semibold">{selectedJob.name}</span>?</p>
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
              <label class="text-xs text-muted-foreground" for="edit-cron">Cron Expression</label>
              <input
                id="edit-cron"
                type="text"
                bind:value={editCron}
                class="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm font-mono"
              />
            </div>
            <div class="space-y-1">
              <label class="text-xs text-muted-foreground" for="edit-subject">Subject</label>
              <input
                id="edit-subject"
                type="text"
                bind:value={editSubject}
                class="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm font-mono"
              />
            </div>
            <div class="space-y-1">
              <label class="text-xs text-muted-foreground" for="edit-payload">Payload (JSON)</label>
              <textarea
                id="edit-payload"
                bind:value={editPayload}
                rows="3"
                class="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm font-mono"
              ></textarea>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div class="space-y-1">
                <label class="text-xs text-muted-foreground" for="edit-tz">Timezone</label>
                <input
                  id="edit-tz"
                  type="text"
                  bind:value={editTimezone}
                  class="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                />
              </div>
              <div class="space-y-1">
                <label for="edit-job-enabled" class="text-xs text-muted-foreground">Enabled</label>
                <div class="flex items-center gap-2 pt-1">
                  <input id="edit-job-enabled" type="checkbox" bind:checked={editEnabled} />
                  <label for="edit-job-enabled" class="text-sm">{editEnabled ? 'Active' : 'Disabled'}</label>
                </div>
              </div>
            </div>

            <div class="text-xs text-muted-foreground pt-2 space-y-1">
              <div>Last run: <span class="font-medium text-foreground">{selectedJob.lastRunAt ? relativeAge(selectedJob.lastRunAt) : '\u2014'}</span></div>
              <div>Next run: <span class="font-medium text-foreground">{selectedJob.nextRun ? formatNextRun(selectedJob.nextRun) : '\u2014'}</span></div>
            </div>
          </div>
        {/if}
      {:else}
        <LogsPanel entityType="cron" entityId={selectedJob.id} />
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
  <Card.Header class="pb-2">
    <div class="flex items-center justify-between">
      <Card.Title class="text-sm font-medium">Cron Jobs</Card.Title>
      {#if !showForm}
        <Button variant="outline" size="sm" onclick={() => (showForm = true)}>Add Job</Button>
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
          <label for="cron-name" class="text-xs text-muted-foreground">Name</label>
          <input
            id="cron-name"
            type="text"
            bind:value={formName}
            placeholder="my-cron-job"
            class="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label for="cron-expr" class="text-xs text-muted-foreground">Cron Expression</label>
          <input
            id="cron-expr"
            type="text"
            bind:value={formCron}
            placeholder="0 9 * * *"
            class="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label for="cron-subject" class="text-xs text-muted-foreground">Subject</label>
          <input
            id="cron-subject"
            type="text"
            bind:value={formSubject}
            placeholder="agent.events.my-event"
            class="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label for="cron-payload" class="text-xs text-muted-foreground">Payload (JSON)</label>
          <textarea
            id="cron-payload"
            bind:value={formPayload}
            rows="3"
            class="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          ></textarea>
        </div>
        <div>
          <label for="cron-tz" class="text-xs text-muted-foreground">Timezone</label>
          <input
            id="cron-tz"
            type="text"
            bind:value={formTimezone}
            placeholder="UTC"
            class="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          />
        </div>
        <div class="flex gap-2">
          <Button size="sm" onclick={handleCreate} disabled={loading}>
            {loading ? 'Creating...' : 'Create'}
          </Button>
          <Button variant="ghost" size="sm" onclick={resetForm}>Cancel</Button>
        </div>
      </div>
    {/if}

    {#if jobs.length === 0}
      <p class="text-sm text-muted-foreground py-4">No cron jobs</p>
    {:else}
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.Head>Name</Table.Head>
            <Table.Head>Cron Expr</Table.Head>
            <Table.Head>Subject</Table.Head>
            <Table.Head>Timezone</Table.Head>
            <Table.Head>Enabled</Table.Head>
            <Table.Head>Last Run</Table.Head>
            <Table.Head>Next Run</Table.Head>
            <Table.Head class="w-32"></Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each jobs as job}
            <Table.Row class="cursor-pointer hover:bg-muted/50" onclick={() => openJobModal(job)}>
              <Table.Cell class="font-mono text-xs">{job.name}</Table.Cell>
              <Table.Cell class="font-mono">{job.expr}</Table.Cell>
              <Table.Cell class="font-mono text-xs">{job.subject}</Table.Cell>
              <Table.Cell>{job.timezone}</Table.Cell>
              <Table.Cell>
                <Badge variant={job.enabled ? 'default' : 'secondary'}>
                  {job.enabled ? 'On' : 'Off'}
                </Badge>
              </Table.Cell>
              <Table.Cell class="text-xs text-muted-foreground">
                {job.lastRunAt ? relativeAge(job.lastRunAt) : '\u2014'}
              </Table.Cell>
              <Table.Cell class="text-xs text-muted-foreground">
                {job.nextRun ? formatNextRun(job.nextRun) : '\u2014'}
              </Table.Cell>
              <Table.Cell>
                <div class="flex gap-1">
                  <Button variant="ghost" size="sm" onclick={(e: MouseEvent) => handleToggle(job.name, e)}>
                    {job.enabled ? 'Pause' : 'Resume'}
                  </Button>
                  <Button variant="outline" size="sm" onclick={(e: MouseEvent) => handleRun(job.name, e)}>
                    Run
                  </Button>
                </div>
              </Table.Cell>
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    {/if}
  </Card.Content>
</Card.Root>
