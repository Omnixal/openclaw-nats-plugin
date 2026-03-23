<script lang="ts">
  import * as Table from '$lib/components/ui/table';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
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

  function parseDetail(detail: string | null): string {
    if (!detail) return '';
    try {
      const parsed = JSON.parse(detail);
      return parsed.message || parsed.target || JSON.stringify(parsed);
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
          <Table.Row>
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
