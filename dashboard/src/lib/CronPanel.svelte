<script lang="ts">
  import * as Card from '$lib/components/ui/card';
  import * as Table from '$lib/components/ui/table';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import {
    type CronJob,
    createCronJob,
    deleteCronJob,
    toggleCronJob,
    runCronJobNow,
  } from '$lib/api';
  import { relativeAge } from '$lib/utils';

  interface Props {
    jobs: CronJob[];
    onRefresh: () => void;
  }

  let { jobs, onRefresh }: Props = $props();

  let showForm = $state(false);
  let formName = $state('');
  let formCron = $state('0 9 * * *');
  let formSubject = $state('agent.events.');
  let formPayload = $state('{}');
  let formTimezone = $state('UTC');
  let formError: string | null = $state(null);
  let actionError: string | null = $state(null);
  let loading = $state(false);

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

    if (!formSubject.startsWith('agent.events.')) {
      formError = 'Subject must start with agent.events.';
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

  async function handleToggle(name: string) {
    try {
      actionError = null;
      await toggleCronJob(name);
      onRefresh();
    } catch (e: any) {
      actionError = e.message;
    }
  }

  async function handleRun(name: string) {
    try {
      actionError = null;
      await runCronJobNow(name);
      onRefresh();
    } catch (e: any) {
      actionError = e.message;
    }
  }

  async function handleDelete(name: string) {
    try {
      actionError = null;
      await deleteCronJob(name);
      onRefresh();
    } catch (e: any) {
      actionError = e.message;
    }
  }
</script>

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
            <Table.Head class="w-40"></Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each jobs as job}
            <Table.Row>
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
                {job.lastRunAt ? relativeAge(job.lastRunAt) : '—'}
              </Table.Cell>
              <Table.Cell class="text-xs text-muted-foreground">
                {job.nextRun ? formatNextRun(job.nextRun) : '—'}
              </Table.Cell>
              <Table.Cell>
                <div class="flex gap-1">
                  <Button variant="ghost" size="sm" onclick={() => handleToggle(job.name)}>
                    {job.enabled ? 'Pause' : 'Resume'}
                  </Button>
                  <Button variant="outline" size="sm" onclick={() => handleRun(job.name)}>
                    Run
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    class="text-destructive"
                    onclick={() => handleDelete(job.name)}
                  >
                    Delete
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
