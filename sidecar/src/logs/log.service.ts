import { Service, BaseService } from '@onebun/core';
import { LogRepository } from './log.repository';
import { ulid } from 'ulid';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

@Service()
export class LogService extends BaseService {
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private repo: LogRepository) {
    super();
  }

  async onModuleInit(): Promise<void> {
    this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  async logDelivery(routeId: string, subject: string, detail?: string): Promise<void> {
    try {
      await this.repo.insert({
        id: ulid(),
        entityType: 'route',
        entityId: routeId,
        action: 'delivery',
        subject,
        detail: detail ?? null,
        success: true,
        createdAt: new Date(),
      });
    } catch (err) {
      this.logger.error('Failed to write delivery log', err);
    }
  }

  async logCronFire(jobId: string, subject: string, manual: boolean = false): Promise<void> {
    try {
      await this.repo.insert({
        id: ulid(),
        entityType: 'cron',
        entityId: jobId,
        action: 'fire',
        subject,
        detail: manual ? JSON.stringify({ manual: true }) : null,
        success: true,
        createdAt: new Date(),
      });
    } catch (err) {
      this.logger.error('Failed to write cron fire log', err);
    }
  }

  async logError(entityType: 'route' | 'cron', entityId: string, subject: string, error: unknown): Promise<void> {
    try {
      const detail = error instanceof Error
        ? JSON.stringify({ message: error.message, stack: error.stack })
        : JSON.stringify({ message: String(error) });

      await this.repo.insert({
        id: ulid(),
        entityType,
        entityId,
        action: 'error',
        subject,
        detail,
        success: false,
        createdAt: new Date(),
      });
    } catch (err) {
      this.logger.error('Failed to write error log', err);
    }
  }

  async getLogsForEntity(
    entityType: string,
    entityId: string,
    opts?: { limit?: number; offset?: number; success?: boolean; action?: string; subjectLike?: string },
  ) {
    const filters = { entityType, entityId, success: opts?.success, action: opts?.action, subjectLike: opts?.subjectLike };
    const [logs, total] = await Promise.all([
      this.repo.findByEntity(filters, opts?.limit, opts?.offset),
      this.repo.countByEntity(filters),
    ]);
    return {
      items: logs.map(l => ({ ...l, createdAt: l.createdAt.getTime() })),
      total,
    };
  }

  async getRecentLogs(limit?: number) {
    const logs = await this.repo.findRecent(limit);
    return logs.map(l => ({
      ...l,
      createdAt: l.createdAt.getTime(),
    }));
  }

  private async cleanup(): Promise<void> {
    try {
      const deleted = await this.repo.deleteOlderThan(SEVEN_DAYS_MS);
      if (deleted > 0) {
        this.logger.info(`Cleaned up ${deleted} old execution logs`);
      }
    } catch (err) {
      this.logger.error('Failed to cleanup execution logs', err);
    }
  }
}
