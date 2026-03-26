<script lang="ts">
  import * as Table from '$lib/components/ui/table';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import { Modal } from '$lib/components/ui/modal';
  import { type ExecutionLog, type LogFilters, getLogs } from '$lib/api';
  import { relativeAge } from '$lib/utils';

  interface Props {
    entityType: string;
    entityId: string;
  }

  let { entityType, entityId }: Props = $props();

  let items: ExecutionLog[] = $state([]);
  let total: number = $state(0);
  let page: number = $state(0);
  let loading = $state(false);
  let error: string | null = $state(null);

  // Filters
  let filterStatus: '' | 'true' | 'false' = $state('');
  let filterAction: string = $state('');
  let filterSubject: string = $state('');

  const PAGE_SIZE = 20;

  let prevEntity = $state('');
  $effect(() => {
    const key = `${entityType}:${entityId}`;
    if (key !== prevEntity) {
      prevEntity = key;
      page = 0;
      filterStatus = '';
      filterAction = '';
      filterSubject = '';
    }
  });

  function buildFilters(): LogFilters | undefined {
    const f: LogFilters = {};
    if (filterStatus === 'true') f.success = true;
    else if (filterStatus === 'false') f.success = false;
    if (filterAction) f.action = filterAction;
    if (filterSubject.trim()) f.subject = filterSubject.trim();
    return Object.keys(f).length > 0 ? f : undefined;
  }

  async function loadPage() {
    loading = true;
    error = null;
    try {
      const result = await getLogs(entityType, entityId, PAGE_SIZE, page * PAGE_SIZE, buildFilters());
      items = result.items;
      total = result.total;
    } catch (e: any) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  function applyFilters() {
    page = 0;
    loadPage();
  }

  function resetFilters() {
    filterStatus = '';
    filterAction = '';
    filterSubject = '';
    page = 0;
    loadPage();
  }

  function prevPage() {
    if (page > 0) {
      page--;
      loadPage();
    }
  }

  function nextPage() {
    if ((page + 1) * PAGE_SIZE < total) {
      page++;
      loadPage();
    }
  }

  let selectedLog: ExecutionLog | null = $state(null);

  function parseDetail(detail: string | null): string {
    if (!detail) return '';
    try {
      const parsed = JSON.parse(detail);
      return parsed.message || parsed.target || JSON.stringify(parsed);
    } catch {
      return detail;
    }
  }

  function formatDetailFull(detail: string | null): string {
    if (!detail) return '(no detail)';
    try {
      return JSON.stringify(JSON.parse(detail), null, 2);
    } catch {
      return detail;
    }
  }

  $effect(() => {
    entityType; entityId;
    loadPage();
  });

  let totalPages = $derived(Math.max(1, Math.ceil(total / PAGE_SIZE)));
  let hasFilters = $derived(filterStatus !== '' || filterAction !== '' || filterSubject.trim() !== '');
</script>

{#if selectedLog}
  <Modal
    open={true}
    title="Log Detail"
    onClose={() => (selectedLog = null)}
  >
    {#snippet children()}
      <div class="space-y-3">
        <div class="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span class="text-muted-foreground">Time:</span>
            <span class="font-medium ml-1">{new Date(selectedLog.createdAt).toLocaleString()}</span>
          </div>
          <div>
            <span class="text-muted-foreground">Action:</span>
            <Badge variant="outline" class="ml-1">{selectedLog.action}</Badge>
          </div>
          <div class="col-span-2">
            <span class="text-muted-foreground">Subject:</span>
            <span class="font-mono font-medium ml-1">{selectedLog.subject}</span>
          </div>
          <div>
            <span class="text-muted-foreground">Status:</span>
            <Badge variant={selectedLog.success ? 'default' : 'destructive'} class="ml-1">
              {selectedLog.success ? 'ok' : 'error'}
            </Badge>
          </div>
        </div>
        <div class="space-y-1">
          <span class="text-xs text-muted-foreground">Payload / Detail:</span>
          <pre class="rounded-md bg-muted p-3 text-xs font-mono overflow-auto max-h-80 whitespace-pre-wrap break-all">{formatDetailFull(selectedLog.detail)}</pre>
        </div>
      </div>
    {/snippet}
  </Modal>
{/if}

<div class="space-y-3">
  <!-- Filters -->
  <div class="flex flex-wrap items-end gap-2">
    <div class="space-y-1">
      <label for="log-filter-status" class="text-xs text-muted-foreground">Status</label>
      <select
        id="log-filter-status"
        bind:value={filterStatus}
        class="rounded-md border border-input bg-background px-2 py-1 text-xs"
      >
        <option value="">All</option>
        <option value="true">Success</option>
        <option value="false">Error</option>
      </select>
    </div>
    <div class="space-y-1">
      <label for="log-filter-action" class="text-xs text-muted-foreground">Action</label>
      <select
        id="log-filter-action"
        bind:value={filterAction}
        class="rounded-md border border-input bg-background px-2 py-1 text-xs"
      >
        <option value="">All</option>
        <option value="delivery">delivery</option>
        <option value="fire">fire</option>
        <option value="error">error</option>
        <option value="skip">skip</option>
      </select>
    </div>
    <div class="space-y-1">
      <label for="log-filter-subject" class="text-xs text-muted-foreground">Subject</label>
      <input
        id="log-filter-subject"
        type="text"
        bind:value={filterSubject}
        placeholder="substring..."
        class="rounded-md border border-input bg-background px-2 py-1 text-xs w-36"
        onkeydown={(e: KeyboardEvent) => e.key === 'Enter' && applyFilters()}
      />
    </div>
    <Button variant="outline" size="sm" onclick={applyFilters} disabled={loading}>Filter</Button>
    {#if hasFilters}
      <Button variant="ghost" size="sm" onclick={resetFilters}>Clear</Button>
    {/if}
  </div>

  {#if error}
    <div class="rounded-md bg-destructive/10 p-2 text-xs text-destructive">{error}</div>
  {/if}

  {#if items.length === 0 && !loading}
    <p class="text-xs text-muted-foreground py-2">No logs{hasFilters ? ' matching filters' : ''}</p>
  {:else}
    <Table.Root>
      <Table.Header>
        <Table.Row>
          <Table.Head>Time</Table.Head>
          <Table.Head>Action</Table.Head>
          <Table.Head>Subject</Table.Head>
          <Table.Head>Status</Table.Head>
          <Table.Head>Detail</Table.Head>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {#each items as log}
          <Table.Row class="cursor-pointer hover:bg-muted/50" onclick={() => (selectedLog = log)}>
            <Table.Cell class="text-xs text-muted-foreground whitespace-nowrap">
              {relativeAge(log.createdAt)}
            </Table.Cell>
            <Table.Cell>
              <Badge variant="outline">{log.action}</Badge>
            </Table.Cell>
            <Table.Cell class="font-mono text-xs">{log.subject}</Table.Cell>
            <Table.Cell>
              <Badge variant={log.success ? 'default' : 'destructive'}>
                {log.success ? 'ok' : 'error'}
              </Badge>
            </Table.Cell>
            <Table.Cell class="text-xs text-muted-foreground max-w-48 truncate" title={parseDetail(log.detail)}>
              {parseDetail(log.detail)}
            </Table.Cell>
          </Table.Row>
        {/each}
      </Table.Body>
    </Table.Root>

    <!-- Pagination -->
    <div class="flex items-center justify-between pt-1">
      <span class="text-xs text-muted-foreground">
        {total} log{total === 1 ? '' : 's'}{hasFilters ? ' (filtered)' : ''}
      </span>
      <div class="flex items-center gap-2">
        <Button variant="outline" size="sm" onclick={prevPage} disabled={page === 0 || loading}>
          Prev
        </Button>
        <span class="text-xs text-muted-foreground">{page + 1} / {totalPages}</span>
        <Button variant="outline" size="sm" onclick={nextPage} disabled={(page + 1) * PAGE_SIZE >= total || loading}>
          Next
        </Button>
      </div>
    </div>
  {/if}
</div>
