import { type } from 'arktype';

export const publishBodySchema = type({
  subject: 'string',
  payload: 'unknown',
  'meta?': {
    'priority?': 'number',
    'traceId?': 'string',
    'correlationId?': 'string',
  },
});

export type PublishBody = typeof publishBodySchema.infer;

export const markDeliveredBodySchema = type({
  ids: 'string[]',
});

export type MarkDeliveredBody = typeof markDeliveredBodySchema.infer;

export const createRouteBodySchema = type({
  pattern: 'string',
  'target?': 'string',
  'priority?': 'number',
});

export type CreateRouteBody = typeof createRouteBodySchema.infer;

export const createCronBodySchema = type({
  name: 'string',
  cron: 'string',
  subject: 'string',
  'payload?': 'unknown',
  'timezone?': 'string',
});

export type CreateCronBody = typeof createCronBodySchema.infer;

export const updateRouteBodySchema = type({
  'target?': 'string',
  'priority?': 'number',
  'enabled?': 'boolean',
});

export type UpdateRouteBody = typeof updateRouteBodySchema.infer;

export const updateCronBodySchema = type({
  'cron?': 'string',
  'subject?': 'string',
  'payload?': 'unknown',
  'timezone?': 'string',
  'enabled?': 'boolean',
});

export type UpdateCronBody = typeof updateCronBodySchema.infer;

/** Validate that subject has content after 'agent.events.' prefix and doesn't end with '.' */
export function isValidAgentSubject(subject: string): boolean {
  if (!subject.startsWith('agent.events.')) return false;
  const rest = subject.slice('agent.events.'.length);
  if (rest.length === 0) return false;
  if (rest.endsWith('.')) return false;
  return true;
}
