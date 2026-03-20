import { Service, BaseService } from '@onebun/core';

export interface SubjectMetric {
  subject: string;
  published: number;
  consumed: number;
  lastPublishedAt: number | null;
  lastConsumedAt: number | null;
}

interface CounterEntry {
  count: number;
  lastAt: number;
}

@Service()
export class MetricsService extends BaseService {
  private published = new Map<string, CounterEntry>();
  private consumed = new Map<string, CounterEntry>();

  recordPublish(subject: string): void {
    const entry = this.published.get(subject);
    const now = Date.now();
    if (entry) {
      entry.count++;
      entry.lastAt = now;
    } else {
      this.published.set(subject, { count: 1, lastAt: now });
    }
  }

  recordConsume(subject: string): void {
    const entry = this.consumed.get(subject);
    const now = Date.now();
    if (entry) {
      entry.count++;
      entry.lastAt = now;
    } else {
      this.consumed.set(subject, { count: 1, lastAt: now });
    }
  }

  getAll(): SubjectMetric[] {
    const subjects = new Set<string>([
      ...this.published.keys(),
      ...this.consumed.keys(),
    ]);

    const result: SubjectMetric[] = [];
    for (const subject of subjects) {
      const pub = this.published.get(subject);
      const con = this.consumed.get(subject);
      result.push({
        subject,
        published: pub?.count ?? 0,
        consumed: con?.count ?? 0,
        lastPublishedAt: pub?.lastAt ?? null,
        lastConsumedAt: con?.lastAt ?? null,
      });
    }

    return result.sort((a, b) => a.subject.localeCompare(b.subject));
  }
}
