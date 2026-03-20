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
