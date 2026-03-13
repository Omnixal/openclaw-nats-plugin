import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { PipelineService } from './pipeline.service';
import { DedupHandler } from './dedup.handler';
import { FilterHandler } from './filter.handler';
import { EnrichHandler } from './enrich.handler';
import { PriorityHandler } from './priority.handler';
import type { NatsEventEnvelope } from '../publisher/envelope';
import type { PipelineContext } from './pre-handler.interface';

function makeEnvelope(overrides: Partial<NatsEventEnvelope> = {}): NatsEventEnvelope {
  return {
    id: 'evt-1',
    subject: 'agent.inbound.task.created',
    timestamp: new Date().toISOString(),
    source: 'test',
    payload: { foo: 'bar' },
    meta: { priority: 5 },
    ...overrides,
  };
}

// --- PipelineService tests (mocked handlers) ---

describe('PipelineService', () => {
  let pipeline: PipelineService;
  let dedupHandler: { handle: any; name: string };
  let filterHandler: { handle: any; name: string };
  let enrichHandler: { handle: any; name: string };
  let priorityHandler: { handle: any; name: string };

  beforeEach(() => {
    dedupHandler = { name: 'dedup', handle: mock(() => Promise.resolve('pass' as const)) };
    filterHandler = { name: 'filter', handle: mock(() => Promise.resolve('pass' as const)) };
    enrichHandler = { name: 'enrich', handle: mock(() => Promise.resolve('pass' as const)) };
    priorityHandler = { name: 'priority', handle: mock(() => Promise.resolve('pass' as const)) };

    pipeline = new PipelineService(
      dedupHandler as any,
      filterHandler as any,
      enrichHandler as any,
      priorityHandler as any,
    );
    // Stub logger
    (pipeline as any).logger = { debug: () => {} };
  });

  it('should return pass when all handlers pass', async () => {
    const { result } = await pipeline.process(makeEnvelope());
    expect(result).toBe('pass');
    expect(dedupHandler.handle).toHaveBeenCalledTimes(1);
    expect(filterHandler.handle).toHaveBeenCalledTimes(1);
    expect(enrichHandler.handle).toHaveBeenCalledTimes(1);
    expect(priorityHandler.handle).toHaveBeenCalledTimes(1);
  });

  it('should return drop when dedup drops, no further handlers called', async () => {
    dedupHandler.handle = mock(() => Promise.resolve('drop' as const));

    const { result } = await pipeline.process(makeEnvelope());
    expect(result).toBe('drop');
    expect(dedupHandler.handle).toHaveBeenCalledTimes(1);
    expect(filterHandler.handle).not.toHaveBeenCalled();
    expect(enrichHandler.handle).not.toHaveBeenCalled();
    expect(priorityHandler.handle).not.toHaveBeenCalled();
  });

  it('should return drop when filter drops after dedup passes', async () => {
    filterHandler.handle = mock(() => Promise.resolve('drop' as const));

    const { result } = await pipeline.process(makeEnvelope());
    expect(result).toBe('drop');
    expect(dedupHandler.handle).toHaveBeenCalledTimes(1);
    expect(filterHandler.handle).toHaveBeenCalledTimes(1);
    expect(enrichHandler.handle).not.toHaveBeenCalled();
    expect(priorityHandler.handle).not.toHaveBeenCalled();
  });

  it('should accumulate enrichment data through the pipeline', async () => {
    enrichHandler.handle = mock(async (_msg: NatsEventEnvelope, ctx: PipelineContext) => {
      ctx.enrichments['processedAt'] = '2026-01-01T00:00:00.000Z';
      ctx.enrichments['source'] = 'test';
      return 'pass' as const;
    });
    priorityHandler.handle = mock(async (_msg: NatsEventEnvelope, ctx: PipelineContext) => {
      ctx.enrichments['priority'] = 5;
      return 'pass' as const;
    });

    const { result, ctx } = await pipeline.process(makeEnvelope());
    expect(result).toBe('pass');
    expect(ctx.enrichments['processedAt']).toBe('2026-01-01T00:00:00.000Z');
    expect(ctx.enrichments['source']).toBe('test');
    expect(ctx.enrichments['priority']).toBe(5);
  });
});

// --- DedupHandler tests ---

describe('DedupHandler', () => {
  let handler: DedupHandler;
  let dedupService: { isDuplicate: any };

  beforeEach(() => {
    dedupService = { isDuplicate: mock(() => Promise.resolve(false)) };
    handler = new DedupHandler(dedupService as any);
    (handler as any).logger = { debug: () => {} };
  });

  it('should return pass for non-duplicate events', async () => {
    const result = await handler.handle(makeEnvelope(), { enrichments: {} });
    expect(result).toBe('pass');
    expect(dedupService.isDuplicate).toHaveBeenCalledWith('evt-1', 'agent.inbound.task.created');
  });

  it('should return drop for duplicate events', async () => {
    dedupService.isDuplicate = mock(() => Promise.resolve(true));
    const result = await handler.handle(makeEnvelope(), { enrichments: {} });
    expect(result).toBe('drop');
  });
});

// --- FilterHandler tests ---

describe('FilterHandler', () => {
  let handler: FilterHandler;

  beforeEach(() => {
    handler = new FilterHandler();
    (handler as any).logger = { debug: () => {} };
    (handler as any).rules = [];
  });

  it('should return pass when no rules match', async () => {
    const result = await handler.handle(makeEnvelope(), { enrichments: {} });
    expect(result).toBe('pass');
  });

  it('should return drop when a matching rule says drop', async () => {
    (handler as any).rules = [
      { subjectPattern: 'agent.inbound.>', action: 'drop', priority: 1 },
    ];
    const result = await handler.handle(makeEnvelope(), { enrichments: {} });
    expect(result).toBe('drop');
  });

  it('should match single-token wildcard *', async () => {
    expect(handler.matchSubject('agent.inbound.task.created', 'agent.*.task.created')).toBe(true);
    expect(handler.matchSubject('agent.inbound.task.created', 'agent.*.job.created')).toBe(false);
  });

  it('should match multi-token wildcard >', async () => {
    expect(handler.matchSubject('agent.inbound.task.created', 'agent.>')).toBe(true);
    expect(handler.matchSubject('agent.inbound', 'agent.>')).toBe(true);
    expect(handler.matchSubject('other.inbound', 'agent.>')).toBe(false);
  });

  it('should require exact match for literal tokens', async () => {
    expect(handler.matchSubject('agent.inbound', 'agent.inbound')).toBe(true);
    expect(handler.matchSubject('agent.outbound', 'agent.inbound')).toBe(false);
    expect(handler.matchSubject('agent.inbound.extra', 'agent.inbound')).toBe(false);
  });
});

// --- PriorityHandler tests ---

describe('PriorityHandler', () => {
  let handler: PriorityHandler;

  beforeEach(() => {
    handler = new PriorityHandler();
    (handler as any).logger = { debug: () => {} };
  });

  it('should set default priority 5 when meta is undefined', async () => {
    const ctx = { enrichments: {} as Record<string, unknown> };
    const result = await handler.handle(makeEnvelope({ meta: undefined }), ctx);
    expect(result).toBe('pass');
    expect(ctx.enrichments['priority']).toBe(5);
  });

  it('should clamp priority to minimum 1', async () => {
    const ctx = { enrichments: {} as Record<string, unknown> };
    await handler.handle(makeEnvelope({ meta: { priority: -3 } }), ctx);
    expect(ctx.enrichments['priority']).toBe(1);
  });

  it('should clamp priority to maximum 10', async () => {
    const ctx = { enrichments: {} as Record<string, unknown> };
    await handler.handle(makeEnvelope({ meta: { priority: 42 } }), ctx);
    expect(ctx.enrichments['priority']).toBe(10);
  });

  it('should pass through valid priority values', async () => {
    const ctx = { enrichments: {} as Record<string, unknown> };
    await handler.handle(makeEnvelope({ meta: { priority: 7 } }), ctx);
    expect(ctx.enrichments['priority']).toBe(7);
  });
});

// --- EnrichHandler tests ---

describe('EnrichHandler', () => {
  let handler: EnrichHandler;

  beforeEach(() => {
    handler = new EnrichHandler();
    (handler as any).logger = { debug: () => {} };
  });

  it('should add processedAt and source to context', async () => {
    const ctx = { enrichments: {} as Record<string, unknown> };
    const result = await handler.handle(makeEnvelope({ source: 'my-source' }), ctx);
    expect(result).toBe('pass');
    expect(typeof ctx.enrichments['processedAt']).toBe('string');
    expect(ctx.enrichments['source']).toBe('my-source');
  });
});
