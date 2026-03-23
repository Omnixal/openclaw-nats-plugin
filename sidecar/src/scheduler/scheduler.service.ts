import { Service, BaseService, QueueService } from '@onebun/core';
import { SchedulerRepository } from './scheduler.repository';
import { PublisherService } from '../publisher/publisher.service';
import { LogService } from '../logs/log.service';
import { ulid } from 'ulid';

interface AddJobInput {
  name: string;
  expr: string;
  subject: string;
  payload?: unknown;
  timezone?: string;
}

@Service()
export class SchedulerService extends BaseService {
  private _queueReady = false;

  constructor(
    private repo: SchedulerRepository,
    private queueService: QueueService,
    private publisher: PublisherService,
    private logService: LogService,
  ) {
    super();
  }

  private get scheduler() {
    return this.queueService.getScheduler();
  }

  markQueueReady(isReady = true): void {
    this._queueReady = isReady;
  }

  async restoreJobs(): Promise<void> {
    try {
      const jobs = await this.repo.findAllEnabled();
      for (const job of jobs) {
        this.scheduler.addCronJob(
          job.name,
          job.expr,
          `scheduler.fire.${job.name}`,
        );
      }
      if (jobs.length > 0) {
        this.logger.info(`Restored ${jobs.length} cron jobs from DB`);
      } else {
        this.logger.info('No cron jobs found in DB');
      }
    } catch (err) {
      this.logger.error('Failed to restore cron jobs', err);
    }
  }

  async add(input: AddJobInput) {
    const job = await this.repo.upsert({
      id: ulid(),
      name: input.name,
      expr: input.expr,
      subject: input.subject,
      payload: input.payload ?? null,
      timezone: input.timezone ?? 'UTC',
      enabled: true,
      createdAt: new Date(),
    });

    if (this.scheduler.hasJob(input.name)) {
      // Remove and re-add to update the cron expression
      this.scheduler.removeJob(input.name);
    }
    this.scheduler.addCronJob(
      input.name,
      input.expr,
      `scheduler.fire.${input.name}`,
    );

    this.logger.info(`Cron job '${input.name}' registered: ${input.expr} -> ${input.subject}`);
    return job;
  }

  async update(name: string, fields: { cron?: string; subject?: string; payload?: unknown; timezone?: string; enabled?: boolean }) {
    const updates: Record<string, unknown> = {};
    if (fields.cron !== undefined) updates.expr = fields.cron;
    if (fields.subject !== undefined) updates.subject = fields.subject;
    if (fields.payload !== undefined) updates.payload = fields.payload;
    if (fields.timezone !== undefined) updates.timezone = fields.timezone;
    if (fields.enabled !== undefined) updates.enabled = fields.enabled;

    if (Object.keys(updates).length === 0) {
      return this.repo.findByName(name);
    }

    const updated = await this.repo.updateByName(name, updates as any);
    if (!updated) return null;

    // Re-register in runtime scheduler if expr or enabled changed
    if (this.scheduler.hasJob(name)) {
      this.scheduler.removeJob(name);
    }
    if (updated.enabled) {
      this.scheduler.addCronJob(name, updated.expr, `scheduler.fire.${name}`);
    }

    this.logger.info(`Cron job '${name}' updated`);
    return updated;
  }

  async remove(name: string): Promise<boolean> {
    const deleted = await this.repo.deleteByName(name);
    if (this.scheduler.hasJob(name)) {
      this.scheduler.removeJob(name);
    }
    return deleted;
  }

  async list() {
    const dbJobs = await this.repo.findAll();
    return dbJobs.map(job => {
      const runtime = this.scheduler.getJob(job.name);
      return {
        ...job,
        lastRunAt: job.lastRunAt?.getTime() ?? null,
        createdAt: job.createdAt.getTime(),
        nextRun: runtime?.nextRun ?? null,
        isRunning: runtime?.isRunning ?? false,
      };
    });
  }

  async toggle(name: string) {
    const job = await this.repo.findByName(name);
    if (!job) return null;

    const newEnabled = !job.enabled;
    await this.repo.setEnabled(name, newEnabled);

    if (newEnabled) {
      this.scheduler.addCronJob(
        name,
        job.expr,
        `scheduler.fire.${name}`,
      );
      this.logger.info(`Cron job '${name}' enabled`);
    } else {
      if (this.scheduler.hasJob(name)) {
        this.scheduler.removeJob(name);
      }
      this.logger.info(`Cron job '${name}' disabled`);
    }

    return this.repo.findByName(name);
  }

  private buildCronPayload(job: { name: string; payload: unknown }, manual: boolean): Record<string, unknown> {
    const base = (job.payload && typeof job.payload === 'object' && !Array.isArray(job.payload))
      ? (job.payload as Record<string, unknown>)
      : {};
    return { ...base, _cron: { jobName: job.name, firedAt: new Date().toISOString(), ...(manual ? { manual: true } : {}) } };
  }

  async fireNow(name: string): Promise<boolean> {
    const job = await this.repo.findByName(name);
    if (!job) return false;

    if (!this._queueReady) {
      this.logger.warn(`Cron job '${name}' fire skipped — queue not ready`);
      return false;
    }

    try {
      const payload = this.buildCronPayload(job, true);
      await this.publisher.publish(job.subject, payload);
      await this.repo.updateLastRun(name);
      await this.logService.logCronFire(job.id, job.subject, true);
      this.logger.info(`Cron job '${name}' manually fired -> ${job.subject}`);
      return true;
    } catch (err) {
      await this.logService.logError('cron', job.id, job.subject, err);
      throw err;
    }
  }

  async handleFire(jobName: string): Promise<void> {
    const job = await this.repo.findByName(jobName);
    if (!job || !job.enabled) return;

    if (!this._queueReady) {
      this.logger.warn(`Cron fire skipped for '${jobName}' — queue not ready`);
      return;
    }

    try {
      const payload = this.buildCronPayload(job, false);
      await this.publisher.publish(job.subject, payload);
      await this.repo.updateLastRun(job.name);
      await this.logService.logCronFire(job.id, job.subject, false);
      this.logger.debug(`Cron fired: ${job.name} -> ${job.subject}`);
    } catch (err) {
      await this.logService.logError('cron', job.id, job.subject, err);
      this.logger.error(`Cron fire failed: ${job.name}`, err);
    }
  }
}
