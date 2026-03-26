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

export const filterConditionSchema = type({
  field: 'string',
  op: "'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'nin' | 'contains' | 'exists'",
  value: 'unknown',
});

export const filterExpressionSchema = type({
  logic: "'and' | 'or'",
  conditions: filterConditionSchema.array(),
});

export const createRouteBodySchema = type({
  pattern: 'string',
  'name?': 'string',
  'target?': 'string',
  'priority?': 'number',
  'payload?': 'unknown',
  'filter?': filterExpressionSchema,
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
  'payload?': 'unknown',
  'filter?': 'unknown',
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

export const createTimerBodySchema = type({
  name: 'string',
  delayMs: 'number > 0',
  subject: 'string',
  'payload?': 'unknown',
});

export type CreateTimerBody = typeof createTimerBodySchema.infer;

/** Validate that subject has content after 'agent.events.' prefix and doesn't end with '.' */
export function isValidAgentSubject(subject: string): boolean {
  if (!subject.startsWith('agent.events.')) return false;
  const rest = subject.slice('agent.events.'.length);
  if (rest.length === 0) return false;
  if (rest.endsWith('.')) return false;
  return true;
}
