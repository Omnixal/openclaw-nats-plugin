import { describe, it, test, expect, mock, beforeEach } from 'bun:test';
import { RouterService } from './router.service';
import type { DbEventRoute } from '../db/schema';

function createService() {
  const svc = new RouterService({} as any) as any;
  svc.repo = {
    findAll: mock(() => Promise.resolve([])),
    findEnabled: mock(() => Promise.resolve([])),
    create: mock((route: any) => Promise.resolve(route)),
    upsert: mock(() => Promise.resolve({
      route: { id: '01ABC', pattern: 'agent.events.cron.>', target: 'main', priority: 5, enabled: true, createdAt: new Date(), lastDeliveredAt: null, lastEventSubject: null, deliveryCount: 0, lastDeliveryLagMs: null },
      created: true,
    })),
    deleteById: mock(() => Promise.resolve(true)),
    deleteByPattern: mock(() => Promise.resolve(true)),
    count: mock(() => Promise.resolve(0)),
    recordDelivery: mock(() => Promise.resolve()),
  };
  svc.logger = {
    info: mock(() => {}),
    warn: mock(() => {}),
    debug: mock(() => {}),
    error: mock(() => {}),
  };
  return svc as RouterService;
}

function makeRoute(overrides: Partial<DbEventRoute> = {}): DbEventRoute {
  return {
    id: 'route-1',
    pattern: 'events.>',
    target: 'main',
    enabled: true,
    priority: 5,
    createdAt: new Date(),
    lastDeliveredAt: null,
    lastEventSubject: null,
    deliveryCount: 0,
    lastDeliveryLagMs: null,
    ...overrides,
  };
}

describe('RouterService.matchPattern', () => {
  const svc = createService();

  it('exact match returns true', () => {
    expect(svc.matchPattern('orders.created', 'orders.created')).toBe(true);
  });

  it('different exact subject returns false', () => {
    expect(svc.matchPattern('orders.created', 'orders.updated')).toBe(false);
  });

  it('shorter pattern does not match longer subject', () => {
    expect(svc.matchPattern('orders', 'orders.created')).toBe(false);
  });

  it('longer pattern does not match shorter subject', () => {
    expect(svc.matchPattern('orders.created.v2', 'orders.created')).toBe(false);
  });

  it('* matches exactly one token', () => {
    expect(svc.matchPattern('orders.*', 'orders.created')).toBe(true);
  });

  it('* does not match deeper levels', () => {
    expect(svc.matchPattern('orders.*', 'orders.created.v2')).toBe(false);
  });

  it('* in the middle matches one token', () => {
    expect(svc.matchPattern('orders.*.v2', 'orders.created.v2')).toBe(true);
  });

  it('* in the middle does not match wrong suffix', () => {
    expect(svc.matchPattern('orders.*.v2', 'orders.created.v3')).toBe(false);
  });

  it('> matches all descendants (one level)', () => {
    expect(svc.matchPattern('orders.>', 'orders.created')).toBe(true);
  });

  it('> matches all descendants (multiple levels)', () => {
    expect(svc.matchPattern('orders.>', 'orders.created.v2')).toBe(true);
  });

  it('> does not match parent (no tokens after >)', () => {
    expect(svc.matchPattern('orders.>', 'orders')).toBe(false);
  });

  it('bare > matches any subject with at least one token', () => {
    expect(svc.matchPattern('>', 'anything')).toBe(true);
    expect(svc.matchPattern('>', 'a.b.c')).toBe(true);
  });

  it('empty pattern matches empty subject', () => {
    expect(svc.matchPattern('', '')).toBe(true);
  });

  test('agent.events patterns work correctly', () => {
    expect(svc.matchPattern('agent.events.cron.>', 'agent.events.cron.daily')).toBe(true);
    expect(svc.matchPattern('agent.events.cron.*', 'agent.events.cron.daily')).toBe(true);
    expect(svc.matchPattern('agent.events.cron.*', 'agent.events.cron.a.b')).toBe(false);
    expect(svc.matchPattern('agent.events.cron.daily', 'agent.events.cron.daily')).toBe(true);
    expect(svc.matchPattern('agent.events.cron.daily', 'agent.events.cron.other')).toBe(false);
  });
});

describe('RouterService.findMatchingRoutes', () => {
  it('returns empty array when no routes configured', async () => {
    const svc = createService();
    const result = await svc.findMatchingRoutes('orders.created');
    expect(result).toEqual([]);
  });

  it('returns matching routes sorted by priority', async () => {
    const svc = createService() as any;
    const lowPriority = makeRoute({ id: 'r1', pattern: 'orders.>', priority: 10 });
    const highPriority = makeRoute({ id: 'r2', pattern: 'orders.*', priority: 1 });
    const noMatch = makeRoute({ id: 'r3', pattern: 'users.>', priority: 1 });

    svc.repo.findEnabled = mock(() => Promise.resolve([lowPriority, highPriority, noMatch]));

    const result = await (svc as RouterService).findMatchingRoutes('orders.created');
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('r2'); // priority 1 first
    expect(result[1].id).toBe('r1'); // priority 10 second
  });

  it('does not return non-matching routes', async () => {
    const svc = createService() as any;
    const route = makeRoute({ pattern: 'users.created' });
    svc.repo.findEnabled = mock(() => Promise.resolve([route]));

    const result = await (svc as RouterService).findMatchingRoutes('orders.created');
    expect(result).toHaveLength(0);
  });
});

describe('RouterService.subscribe', () => {
  test('subscribe calls upsert and returns route with created flag', async () => {
    const svc = createService() as any;
    const result = await (svc as RouterService).subscribe('agent.events.cron.>', 'main', 5);
    expect(svc.repo.upsert).toHaveBeenCalledTimes(1);
    expect(result.created).toBe(true);
    expect(result.route.pattern).toBe('agent.events.cron.>');
  });

  test('subscribe with existing pattern returns created=false', async () => {
    const svc = createService() as any;
    svc.repo.upsert = mock(() => Promise.resolve({
      route: { id: '01ABC', pattern: 'agent.events.cron.>', target: 'main', priority: 8, enabled: true, createdAt: new Date(Date.now() - 10000), lastDeliveredAt: null, lastEventSubject: null, deliveryCount: 0, lastDeliveryLagMs: null },
      created: false,
    }));

    const result = await (svc as RouterService).subscribe('agent.events.cron.>', 'main', 8);
    expect(result.created).toBe(false);
  });

  test('subscribe passes correct arguments to upsert', async () => {
    const svc = createService() as any;
    await (svc as RouterService).subscribe('orders.>', 'worker', 3);
    expect(svc.repo.upsert).toHaveBeenCalledTimes(1);
    const arg = (svc.repo.upsert as any).mock.calls[0][0];
    expect(arg.pattern).toBe('orders.>');
    expect(arg.target).toBe('worker');
    expect(arg.priority).toBe(3);
    expect(arg.enabled).toBe(true);
    expect(arg.id).toBeDefined();
  });
});

describe('RouterService.recordDelivery', () => {
  test('calls repo.recordDelivery with correct args including lagMs', async () => {
    const svc = createService() as any;
    await (svc as RouterService).recordDelivery('route-1', 'agent.events.cron.daily', 42);
    expect(svc.repo.recordDelivery).toHaveBeenCalledTimes(1);
    expect((svc.repo.recordDelivery as any).mock.calls[0]).toEqual(['route-1', 'agent.events.cron.daily', 42]);
  });
});

describe('RouterService.status', () => {
  it('returns configured false when count is 0', async () => {
    const svc = createService();
    const result = await svc.status();
    expect(result).toEqual({ configured: false, count: 0 });
  });

  it('returns configured true when count > 0', async () => {
    const svc = createService() as any;
    svc.repo.count = mock(() => Promise.resolve(3));
    const result = await (svc as RouterService).status();
    expect(result).toEqual({ configured: true, count: 3 });
  });
});
