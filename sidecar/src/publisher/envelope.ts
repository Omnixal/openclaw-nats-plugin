import { ulid } from 'ulid';

export interface EnvelopeMeta {
  priority?: number;
  traceId?: string;
  correlationId?: string;
}

export interface NatsEventEnvelope {
  id: string;
  subject: string;
  timestamp: string;
  source: string;
  sessionKey?: string;
  agentTarget?: string;
  payload: unknown;
  meta?: EnvelopeMeta;
}

export function createEnvelope(
  subject: string,
  payload: unknown,
  meta?: EnvelopeMeta,
  options?: { sessionKey?: string; agentTarget?: string; source?: string },
): NatsEventEnvelope {
  return {
    id: ulid(),
    subject,
    timestamp: new Date().toISOString(),
    source: options?.source ?? 'openclaw-plugin',
    sessionKey: options?.sessionKey,
    agentTarget: options?.agentTarget,
    payload,
    meta: meta ? { priority: meta.priority ?? 5, ...meta } : { priority: 5 },
  };
}
