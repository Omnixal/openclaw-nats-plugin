import { Service, BaseService } from '@onebun/core';
import { RouterRepository } from './router.repository';
import type { DbEventRoute } from '../db/schema';
import { ulid } from 'ulid';

@Service()
export class RouterService extends BaseService {
  constructor(private repo: RouterRepository) {
    super();
  }

  /** NATS-style pattern matching: exact, * (one level), > (all descendants) */
  matchPattern(pattern: string, subject: string): boolean {
    const patParts = pattern.split('.');
    const subParts = subject.split('.');

    for (let i = 0; i < patParts.length; i++) {
      if (patParts[i] === '>') {
        return i < subParts.length; // > must match at least one token after
      }
      if (patParts[i] === '*') {
        if (i >= subParts.length) return false;
        continue;
      }
      if (i >= subParts.length || patParts[i] !== subParts[i]) return false;
    }

    return patParts.length === subParts.length;
  }

  async findMatchingRoutes(subject: string): Promise<DbEventRoute[]> {
    const routes = await this.repo.findEnabled();
    return routes
      .filter(r => this.matchPattern(r.pattern, subject))
      .sort((a, b) => a.priority - b.priority);
  }

  async listRoutes(filters?: { pattern?: string; target?: string }): Promise<DbEventRoute[]> {
    return this.repo.findAll(filters);
  }

  async subscribe(
    pattern: string,
    target: string = 'main',
    priority: number = 5,
  ): Promise<{ route: DbEventRoute; created: boolean }> {
    return this.repo.upsert({
      id: ulid(),
      pattern,
      target,
      enabled: true,
      priority,
      createdAt: new Date(),
    });
  }

  async updateById(id: string, fields: { target?: string; priority?: number; enabled?: boolean }): Promise<DbEventRoute | null> {
    return this.repo.updateById(id, fields);
  }

  async recordDelivery(routeId: string, subject: string): Promise<void> {
    await this.repo.recordDelivery(routeId, subject);
  }

  async unsubscribe(pattern: string): Promise<boolean> {
    return this.repo.deleteByPattern(pattern);
  }

  async deleteById(id: string): Promise<boolean> {
    return this.repo.deleteById(id);
  }

  async status(): Promise<{ configured: boolean; count: number }> {
    const count = await this.repo.count();
    return { configured: count > 0, count };
  }
}
