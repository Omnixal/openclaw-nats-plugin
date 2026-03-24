const BASE = import.meta.env.BASE_URL + 'api';

async function fetchJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const json = await res.json();
  return json.result ?? json;
}

export interface HealthStatus {
  nats: { connected: boolean; url: string };
  gateway: { connected: boolean; url: string };
  pendingCount: number;
  uptimeSeconds: number;
  config: {
    streams: string[];
    consumerName: string;
    dedupTtlSeconds: number;
  };
}

export interface PendingEvent {
  id: string;
  sessionKey: string;
  subject: string;
  payload: unknown;
  priority: number;
  createdAt: number;
  deliveredAt: number | null;
}

export async function getHealth(): Promise<HealthStatus> {
  return fetchJSON('/health');
}

export async function getPending(sessionKey: string): Promise<PendingEvent[]> {
  return fetchJSON(`/pending/${encodeURIComponent(sessionKey)}`);
}

export async function markDelivered(ids: string[]): Promise<void> {
  await fetchJSON('/pending/mark-delivered', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
}

// ── Routes ──────────────────────────────────────────────────────────

export interface EventRoute {
  id: string;
  pattern: string;
  target: string;
  priority: number;
  enabled: boolean;
  deliveryCount: number;
  lastDeliveredAt: string | null;
  lastEventSubject: string | null;
  lagMs: number | null;
  createdAt: number;
}

export async function getRoutes(): Promise<EventRoute[]> {
  return fetchJSON('/routes/health');
}

export async function createRoute(body: {
  pattern: string;
  target?: string;
  priority?: number;
}): Promise<EventRoute> {
  return fetchJSON('/routes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export interface UpdateRouteBody {
  target?: string;
  priority?: number;
  enabled?: boolean;
}

export async function updateRoute(id: string, body: UpdateRouteBody): Promise<EventRoute> {
  return fetchJSON(`/routes/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function deleteRoute(id: string): Promise<void> {
  await fetchJSON(`/routes/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// ── Cron Jobs ───────────────────────────────────────────────────────

export interface CronJob {
  id: string;
  name: string;
  expr: string;
  subject: string;
  payload: unknown;
  timezone: string;
  enabled: boolean;
  lastRunAt: number | null;
  createdAt: number;
  nextRun: string | null;
  isRunning: boolean;
}

export async function getCronJobs(): Promise<CronJob[]> {
  return fetchJSON('/cron');
}

export async function createCronJob(body: {
  name: string;
  cron: string;
  subject: string;
  payload?: unknown;
  timezone?: string;
}): Promise<CronJob> {
  return fetchJSON('/cron', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export interface UpdateCronBody {
  cron?: string;
  subject?: string;
  payload?: unknown;
  timezone?: string;
  enabled?: boolean;
}

export async function updateCronJob(name: string, body: UpdateCronBody): Promise<CronJob> {
  return fetchJSON(`/cron/${encodeURIComponent(name)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function deleteCronJob(name: string): Promise<void> {
  await fetchJSON(`/cron/${encodeURIComponent(name)}`, { method: 'DELETE' });
}

export async function toggleCronJob(name: string): Promise<CronJob> {
  return fetchJSON(`/cron/${encodeURIComponent(name)}/toggle`, { method: 'PATCH' });
}

export async function runCronJobNow(name: string): Promise<void> {
  await fetchJSON(`/cron/${encodeURIComponent(name)}/run`, { method: 'POST' });
}

// ── Timers ──────────────────────────────────────────────────────────

export interface TimerJob {
  id: string;
  name: string;
  subject: string;
  payload: unknown;
  delayMs: number;
  fireAt: number;
  fired: boolean;
  createdAt: number;
  remainingMs: number;
}

export async function getTimers(): Promise<TimerJob[]> {
  return fetchJSON('/cron/timer');
}

export async function createTimer(body: {
  name: string;
  delayMs: number;
  subject: string;
  payload?: unknown;
}): Promise<TimerJob> {
  return fetchJSON('/cron/timer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function cancelTimer(name: string): Promise<void> {
  await fetchJSON(`/cron/timer/${encodeURIComponent(name)}`, { method: 'DELETE' });
}

// ── Metrics ─────────────────────────────────────────────────────────

export interface SubjectMetric {
  subject: string;
  published: number;
  consumed: number;
  lastPublishedAt: number | null;
  lastConsumedAt: number | null;
}

export async function getMetrics(): Promise<SubjectMetric[]> {
  return fetchJSON('/metrics');
}

// ── Execution Logs ──────────────────────────────────────────────────

export interface ExecutionLog {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  subject: string;
  detail: string | null;
  success: boolean;
  createdAt: number;
}

export interface LogFilters {
  success?: boolean;
  action?: string;
  subject?: string;
}

export interface LogsResult {
  items: ExecutionLog[];
  total: number;
}

export async function getLogs(
  entityType: string,
  entityId: string,
  limit: number = 50,
  offset: number = 0,
  filters?: LogFilters,
): Promise<LogsResult> {
  const params = new URLSearchParams({
    entityType,
    entityId,
    limit: String(limit),
    offset: String(offset),
  });
  if (filters?.success !== undefined) params.set('success', String(filters.success));
  if (filters?.action) params.set('action', filters.action);
  if (filters?.subject) params.set('subject', filters.subject);
  return fetchJSON(`/logs?${params}`);
}

export async function getRecentLogs(limit: number = 20): Promise<ExecutionLog[]> {
  return fetchJSON(`/logs/recent?limit=${limit}`);
}
