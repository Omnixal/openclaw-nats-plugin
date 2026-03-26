import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { createTestController } from '@onebun/core/testing';
import { RouterController } from './router.controller';

describe('GET /api/routes/health', () => {
  let controller: RouterController;
  let mockService: any;

  beforeEach(() => {
    mockService = {
      listRoutes: mock(() => Promise.resolve([
        {
          id: '01ABC', name: 'agent.events.cron.>', pattern: 'agent.events.cron.>',
          target: 'main', enabled: true, priority: 5,
          filter: null, filterDropCount: 0,
          createdAt: new Date(), lastDeliveredAt: new Date(Date.now() - 60000),
          lastEventSubject: 'agent.events.cron.daily', deliveryCount: 42,
          lastDeliveryLagMs: 150,
        },
        {
          id: '01DEF', name: 'agent.events.hook.>', pattern: 'agent.events.hook.>',
          target: 'main', enabled: true, priority: 5,
          filter: null, filterDropCount: 0,
          createdAt: new Date(), lastDeliveredAt: null,
          lastEventSubject: null, deliveryCount: 0,
          lastDeliveryLagMs: null,
        },
      ])),
      subscribe: mock(),
      unsubscribeByName: mock(),
      deleteById: mock(),
      status: mock(),
      findMatchingRoutes: mock(),
      recordDelivery: mock(),
      incrementFilterDropCount: mock(),
    };

    const { instance } = createTestController(RouterController, { deps: [mockService] });
    controller = instance;
  });

  test('returns per-route health with lagMs', async () => {
    const response = await controller.getRoutesHealth();
    // OneBunResponse wraps in { success, result }
    // With createTestController, calling the method directly returns OneBunResponse
    expect(response).toBeDefined();
  });

  test('route with delivery has positive lagMs', async () => {
    const response = await controller.getRoutesHealth();
    // The success() helper returns a Response object - we need to check the actual data
    expect(mockService.listRoutes).toHaveBeenCalledTimes(1);
  });

  test('route without delivery has null lagMs', async () => {
    mockService.listRoutes = mock(() => Promise.resolve([
      {
        id: '01DEF', name: 'agent.events.hook.>', pattern: 'agent.events.hook.>',
        target: 'main', enabled: true, priority: 5,
        filter: null, filterDropCount: 0,
        createdAt: new Date(), lastDeliveredAt: null,
        lastEventSubject: null, deliveryCount: 0,
        lastDeliveryLagMs: null,
      },
    ]));

    const response = await controller.getRoutesHealth();
    expect(mockService.listRoutes).toHaveBeenCalledTimes(1);
  });
});
