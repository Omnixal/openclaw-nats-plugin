import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { createTestService } from '@onebun/core/testing';
import { SchedulerService } from './scheduler.service';

describe('SchedulerService', () => {
  let service: SchedulerService;
  let mockRepo: any;
  let mockQueueService: any;
  let mockScheduler: any;
  let mockPublisher: any;

  beforeEach(() => {
    mockRepo = {
      upsert: mock((job: any) => Promise.resolve({ ...job, id: '01ABC', createdAt: new Date() })),
      findAll: mock(() => Promise.resolve([])),
      findAllEnabled: mock(() => Promise.resolve([])),
      findByName: mock((name: string) => Promise.resolve({
        id: '01ABC', name, expr: '0 9 * * *',
        subject: 'agent.events.cron.daily', payload: { task: 'report' },
        timezone: 'UTC', enabled: true, lastRunAt: null, createdAt: new Date(),
      })),
      deleteByName: mock(() => Promise.resolve(true)),
      updateLastRun: mock(() => Promise.resolve()),
    };

    mockScheduler = {
      hasJob: mock(() => false),
      addCronJob: mock(() => {}),
      removeJob: mock(() => true),
      getJob: mock(() => undefined),
      getJobs: mock(() => []),
    };

    mockQueueService = {
      getScheduler: mock(() => mockScheduler),
    };

    mockPublisher = {
      publish: mock(() => Promise.resolve()),
    };

    const { instance } = createTestService(SchedulerService, {
      deps: [mockRepo, mockQueueService, mockPublisher],
    });
    service = instance;
  });

  test('add creates job in DB and registers with QueueScheduler', async () => {
    await service.add({
      name: 'daily-report',
      expr: '0 9 * * *',
      subject: 'agent.events.cron.daily-report',
      payload: { task: 'report' },
    });

    expect(mockRepo.upsert).toHaveBeenCalledTimes(1);
    expect(mockScheduler.addCronJob).toHaveBeenCalledTimes(1);
    expect(mockScheduler.addCronJob.mock.calls[0]).toEqual([
      'daily-report',
      '0 9 * * *',
      'scheduler.fire.daily-report',
    ]);
  });

  test('add with existing job removes and re-adds', async () => {
    mockScheduler.hasJob = mock(() => true);

    await service.add({
      name: 'daily-report',
      expr: '*/5 * * * *',
      subject: 'agent.events.cron.daily-report',
      payload: {},
    });

    expect(mockScheduler.removeJob).toHaveBeenCalledWith('daily-report');
    expect(mockScheduler.addCronJob).toHaveBeenCalledTimes(1);
  });

  test('remove deletes from DB and QueueScheduler', async () => {
    mockScheduler.hasJob = mock(() => true);

    await service.remove('daily-report');

    expect(mockRepo.deleteByName).toHaveBeenCalledWith('daily-report');
    expect(mockScheduler.removeJob).toHaveBeenCalledWith('daily-report');
  });

  test('handleFire publishes to NATS and updates lastRun', async () => {
    await service.handleFire('daily-report');

    expect(mockRepo.findByName).toHaveBeenCalledWith('daily-report');
    expect(mockPublisher.publish).toHaveBeenCalledTimes(1);
    const [subject, payload] = mockPublisher.publish.mock.calls[0];
    expect(subject).toBe('agent.events.cron.daily');
    expect(payload).toHaveProperty('task', 'report');
    expect(payload).toHaveProperty('_cron');
    expect(payload._cron.jobName).toBe('daily-report');
    expect(typeof payload._cron.firedAt).toBe('string');
    expect(mockRepo.updateLastRun).toHaveBeenCalledWith('daily-report');
  });

  test('handleFire skips disabled job', async () => {
    mockRepo.findByName = mock(() => Promise.resolve({
      id: '01ABC', name: 'disabled-job', expr: '0 9 * * *',
      subject: 'agent.events.cron.daily', payload: null,
      timezone: 'UTC', enabled: false, lastRunAt: null, createdAt: new Date(),
    }));

    await service.handleFire('disabled-job');
    expect(mockPublisher.publish).not.toHaveBeenCalled();
  });

  test('handleFire skips non-existent job', async () => {
    mockRepo.findByName = mock(() => Promise.resolve(undefined));

    await service.handleFire('non-existent');
    expect(mockPublisher.publish).not.toHaveBeenCalled();
  });

  test('list enriches DB jobs with runtime info', async () => {
    mockRepo.findAll = mock(() => Promise.resolve([
      { id: '01ABC', name: 'daily', expr: '0 9 * * *', subject: 'agent.events.cron.daily', payload: null, timezone: 'UTC', enabled: true, lastRunAt: null, createdAt: new Date() },
    ]));
    mockScheduler.getJob = mock(() => ({ nextRun: new Date('2026-03-20T09:00:00Z'), isRunning: false }));

    const result = await service.list();
    expect(result).toHaveLength(1);
    expect(result[0].nextRun).toBeInstanceOf(Date);
    expect(result[0].isRunning).toBe(false);
  });
});
