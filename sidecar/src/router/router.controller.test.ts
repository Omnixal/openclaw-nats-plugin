import { describe, it, expect, mock } from 'bun:test';
import { RouterController } from './router.controller';

const makeRoute = (overrides: Record<string, any> = {}) => ({
  id: 'route-1',
  pattern: 'agent.events.>',
  target: 'main',
  enabled: true,
  priority: 5,
  createdAt: new Date(),
  ...overrides,
});

function createController() {
  const mockRouterService = {
    listRoutes: mock(() => Promise.resolve([makeRoute()])),
    status: mock(() => Promise.resolve({ configured: true, count: 1 })),
    subscribe: mock((pattern: string, target: string, priority: number) =>
      Promise.resolve({ route: makeRoute({ pattern, target, priority }), created: true }),
    ),
    deleteById: mock(() => Promise.resolve(true)),
  };

  const ctrl = new RouterController(mockRouterService as any) as any;
  ctrl.success = (data: any) => ({ status: 200, body: { success: true, result: data } });
  ctrl.error = (msg: string, code: number) => ({ status: code, body: { success: false, error: msg } });

  return { ctrl: ctrl as RouterController & { success: any; error: any }, mockRouterService };
}

describe('RouterController.getRoutes', () => {
  it('returns list of routes', async () => {
    const { ctrl } = createController();
    const res = await ctrl.getRoutes() as any;
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.result).toHaveLength(1);
  });

  it('passes filters to service', async () => {
    const { ctrl, mockRouterService } = createController();
    await ctrl.getRoutes('agent.events.>', 'worker');
    expect(mockRouterService.listRoutes).toHaveBeenCalledWith({
      pattern: 'agent.events.>',
      target: 'worker',
    });
  });
});

describe('RouterController.createRoute', () => {
  it('rejects pattern without agent.events. prefix', async () => {
    const { ctrl } = createController();
    const res = await ctrl.createRoute({ pattern: 'bad.subject' }) as any;
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('agent.events.');
  });

  it('accepts valid agent.events.* pattern', async () => {
    const { ctrl } = createController();
    const res = await ctrl.createRoute({ pattern: 'agent.events.*' }) as any;
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.result.pattern).toBe('agent.events.*');
  });

  it('accepts agent.events.> pattern with custom target and priority', async () => {
    const { ctrl, mockRouterService } = createController();
    const res = await ctrl.createRoute({
      pattern: 'agent.events.>',
      target: 'worker',
      priority: 3,
    }) as any;
    expect(res.status).toBe(200);
    expect(mockRouterService.subscribe).toHaveBeenCalledWith('agent.events.>', 'worker', 3, undefined);
  });

  it('uses default target and priority when not provided', async () => {
    const { ctrl, mockRouterService } = createController();
    await ctrl.createRoute({ pattern: 'agent.events.test' });
    expect(mockRouterService.subscribe).toHaveBeenCalledWith('agent.events.test', 'main', 5, undefined);
  });
});

describe('RouterController.getStatus', () => {
  it('returns configured status', async () => {
    const { ctrl } = createController();
    const res = await ctrl.getStatus() as any;
    expect(res.status).toBe(200);
    expect(res.body.result).toEqual({ configured: true, count: 1 });
  });
});

describe('RouterController.deleteRoute', () => {
  it('calls service deleteById and returns success', async () => {
    const { ctrl, mockRouterService } = createController();
    const res = await ctrl.deleteRoute('route-1') as any;
    expect(res.status).toBe(200);
    expect(res.body.result).toEqual({ deleted: true });
    expect(mockRouterService.deleteById).toHaveBeenCalledWith('route-1');
  });

  it('returns 404 when route not found', async () => {
    const { ctrl, mockRouterService } = createController();
    (mockRouterService.deleteById as any).mockImplementation(() => Promise.resolve(false));
    const res = await ctrl.deleteRoute('nonexistent') as any;
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
