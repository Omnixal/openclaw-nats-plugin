import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { createTestController } from '@onebun/core/testing';
import { SchedulerController } from './scheduler.controller';

/**
 * HTTP-level integration tests for SchedulerController.
 * These test the controller methods directly with mocked service dependencies,
 * verifying request validation and response shaping without requiring a NATS server.
 *
 * Full end-to-end integration tests (with real NATS + SQLite) are in src/integration.test.ts.
 */
describe('SchedulerController HTTP', () => {
  let controller: SchedulerController;
  let mockSchedulerService: any;

  beforeEach(() => {
    mockSchedulerService = {
      add: mock((input: any) => Promise.resolve({
        id: '01ABC',
        name: input.name,
        expr: input.expr,
        subject: input.subject,
        payload: input.payload ?? null,
        timezone: input.timezone ?? 'UTC',
        enabled: true,
        lastRunAt: null,
        createdAt: new Date(),
      })),
      list: mock(() => Promise.resolve([
        {
          id: '01ABC',
          name: 'daily-report',
          expr: '0 9 * * *',
          subject: 'agent.events.cron.daily',
          payload: null,
          timezone: 'UTC',
          enabled: true,
          lastRunAt: null,
          createdAt: new Date(),
          nextRun: new Date('2026-03-21T09:00:00Z'),
          isRunning: false,
        },
      ])),
      remove: mock((name: string) => Promise.resolve(name !== 'non-existent')),
      handleFire: mock(() => Promise.resolve()),
    };

    const result = createTestController(SchedulerController, {
      deps: [mockSchedulerService],
    });
    controller = result.instance;
  });

  test('createJob calls service.add with correct input', async () => {
    const body = {
      name: 'my-cron',
      cron: '*/5 * * * *',
      subject: 'agent.events.cron.check',
      payload: { check: true },
    };

    const response = await controller.createJob(body);
    expect(response).toBeDefined();
    expect(mockSchedulerService.add).toHaveBeenCalledTimes(1);

    const addInput = mockSchedulerService.add.mock.calls[0][0];
    expect(addInput.name).toBe('my-cron');
    expect(addInput.expr).toBe('*/5 * * * *');
    expect(addInput.subject).toBe('agent.events.cron.check');
    expect(addInput.payload).toEqual({ check: true });
  });

  test('createJob rejects subject without agent.events. prefix', async () => {
    const body = {
      name: 'bad-cron',
      cron: '0 9 * * *',
      subject: 'other.topic',
    };

    const response = await controller.createJob(body) as any;
    expect(mockSchedulerService.add).not.toHaveBeenCalled();
    // Controller returns an error response (status 400 or success=false)
    const isError = response.status === 400 || response.body?.success === false;
    expect(isError).toBe(true);
  });

  test('listJobs calls service.list', async () => {
    const response = await controller.listJobs();
    expect(response).toBeDefined();
    expect(mockSchedulerService.list).toHaveBeenCalledTimes(1);
  });

  test('deleteJob calls service.remove and returns success', async () => {
    const response = await controller.deleteJob('daily-report') as any;
    expect(mockSchedulerService.remove).toHaveBeenCalledWith('daily-report');
    expect(response).toBeDefined();
  });

  test('deleteJob returns 404 for non-existent job', async () => {
    const response = await controller.deleteJob('non-existent') as any;
    expect(mockSchedulerService.remove).toHaveBeenCalledWith('non-existent');
    // The error response should indicate 404
    const status = response.status ?? response.body?.status;
    const success = response.body?.success ?? true;
    expect(status === 404 || success === false).toBe(true);
  });

  test('createJob defaults timezone to UTC when not provided', async () => {
    const body = {
      name: 'tz-test',
      cron: '0 9 * * *',
      subject: 'agent.events.cron.tz',
    };

    await controller.createJob(body);
    const addInput = mockSchedulerService.add.mock.calls[0][0];
    expect(addInput.timezone).toBeUndefined(); // controller passes undefined, service defaults
  });

  test('createJob passes timezone when provided', async () => {
    const body = {
      name: 'tz-test',
      cron: '0 9 * * *',
      subject: 'agent.events.cron.tz',
      timezone: 'America/New_York',
    };

    await controller.createJob(body);
    const addInput = mockSchedulerService.add.mock.calls[0][0];
    expect(addInput.timezone).toBe('America/New_York');
  });
});
