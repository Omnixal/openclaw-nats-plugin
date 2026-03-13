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
