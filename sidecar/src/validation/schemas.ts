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
