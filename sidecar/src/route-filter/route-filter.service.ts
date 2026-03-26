import { Service, BaseService } from '@onebun/core';
import type { FilterExpression, FilterCondition } from './filter-expression';

@Service()
export class RouteFilterService extends BaseService {
  evaluate(payload: unknown, filter: FilterExpression | null): boolean {
    if (!filter || !filter.conditions || filter.conditions.length === 0) return true;
    const results = filter.conditions.map(c => this.evalCondition(payload, c));
    return filter.logic === 'or' ? results.some(Boolean) : results.every(Boolean);
  }

  private resolveField(obj: unknown, path: string): { found: boolean; value: unknown } {
    const parts = path.split('.');
    let current: unknown = obj;
    for (const part of parts) {
      if (current === null || current === undefined) return { found: false, value: undefined };
      if (typeof current === 'object') {
        if (!(part in (current as Record<string, unknown>))) return { found: false, value: undefined };
        current = (current as Record<string, unknown>)[part];
      } else {
        return { found: false, value: undefined };
      }
    }
    return { found: true, value: current };
  }

  private evalCondition(payload: unknown, cond: FilterCondition): boolean {
    const { found, value } = this.resolveField(payload, cond.field);

    if (cond.op === 'exists') {
      return cond.value ? found : !found;
    }

    if (!found) return false;

    switch (cond.op) {
      case 'eq':
        return value === cond.value;
      case 'neq':
        return value !== cond.value;
      case 'gt':
        return typeof value === 'number' && typeof cond.value === 'number' && value > cond.value;
      case 'gte':
        return typeof value === 'number' && typeof cond.value === 'number' && value >= cond.value;
      case 'lt':
        return typeof value === 'number' && typeof cond.value === 'number' && value < cond.value;
      case 'lte':
        return typeof value === 'number' && typeof cond.value === 'number' && value <= cond.value;
      case 'in':
        return Array.isArray(cond.value) && cond.value.includes(value);
      case 'nin':
        return Array.isArray(cond.value) && !cond.value.includes(value);
      case 'contains':
        if (typeof value === 'string' && typeof cond.value === 'string') return value.includes(cond.value);
        if (Array.isArray(value)) return value.includes(cond.value);
        return false;
      default:
        return false;
    }
  }
}
