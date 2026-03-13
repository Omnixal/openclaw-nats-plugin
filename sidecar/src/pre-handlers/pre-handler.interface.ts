import type { NatsEventEnvelope } from '../publisher/envelope';

export interface PipelineContext {
  enrichments: Record<string, unknown>;
}

export interface PreHandler {
  name: string;
  handle(msg: NatsEventEnvelope, ctx: PipelineContext): Promise<'pass' | 'drop'>;
}
