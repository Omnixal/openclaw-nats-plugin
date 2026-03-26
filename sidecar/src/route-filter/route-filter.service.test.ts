import { describe, it, expect } from 'bun:test';
import { RouteFilterService } from './route-filter.service';
import type { FilterExpression } from './filter-expression';

const service = new RouteFilterService();

describe('RouteFilterService', () => {
  describe('evaluate - null/empty filter', () => {
    it('returns true for null filter', () => {
      expect(service.evaluate({ x: 1 }, null)).toBe(true);
    });

    it('returns true for empty conditions', () => {
      expect(service.evaluate({ x: 1 }, { logic: 'and', conditions: [] })).toBe(true);
    });
  });

  describe('eq operator', () => {
    it('matches equal string', () => {
      const filter: FilterExpression = {
        logic: 'and',
        conditions: [{ field: 'status', op: 'eq', value: 'active' }],
      };
      expect(service.evaluate({ status: 'active' }, filter)).toBe(true);
      expect(service.evaluate({ status: 'inactive' }, filter)).toBe(false);
    });

    it('matches equal number', () => {
      const filter: FilterExpression = {
        logic: 'and',
        conditions: [{ field: 'count', op: 'eq', value: 42 }],
      };
      expect(service.evaluate({ count: 42 }, filter)).toBe(true);
      expect(service.evaluate({ count: 43 }, filter)).toBe(false);
    });
  });

  describe('neq operator', () => {
    it('matches not equal', () => {
      const filter: FilterExpression = {
        logic: 'and',
        conditions: [{ field: 'status', op: 'neq', value: 'deleted' }],
      };
      expect(service.evaluate({ status: 'active' }, filter)).toBe(true);
      expect(service.evaluate({ status: 'deleted' }, filter)).toBe(false);
    });
  });

  describe('gt / gte / lt / lte operators', () => {
    it('gt: greater than', () => {
      const filter: FilterExpression = {
        logic: 'and',
        conditions: [{ field: 'amount', op: 'gt', value: 10000 }],
      };
      expect(service.evaluate({ amount: 10001 }, filter)).toBe(true);
      expect(service.evaluate({ amount: 10000 }, filter)).toBe(false);
      expect(service.evaluate({ amount: 9999 }, filter)).toBe(false);
    });

    it('gte: greater than or equal', () => {
      const filter: FilterExpression = {
        logic: 'and',
        conditions: [{ field: 'amount', op: 'gte', value: 100 }],
      };
      expect(service.evaluate({ amount: 100 }, filter)).toBe(true);
      expect(service.evaluate({ amount: 101 }, filter)).toBe(true);
      expect(service.evaluate({ amount: 99 }, filter)).toBe(false);
    });

    it('lt: less than', () => {
      const filter: FilterExpression = {
        logic: 'and',
        conditions: [{ field: 'score', op: 'lt', value: 50 }],
      };
      expect(service.evaluate({ score: 49 }, filter)).toBe(true);
      expect(service.evaluate({ score: 50 }, filter)).toBe(false);
    });

    it('lte: less than or equal', () => {
      const filter: FilterExpression = {
        logic: 'and',
        conditions: [{ field: 'score', op: 'lte', value: 50 }],
      };
      expect(service.evaluate({ score: 50 }, filter)).toBe(true);
      expect(service.evaluate({ score: 51 }, filter)).toBe(false);
    });

    it('returns false for non-numeric values', () => {
      const filter: FilterExpression = {
        logic: 'and',
        conditions: [{ field: 'amount', op: 'gt', value: 100 }],
      };
      expect(service.evaluate({ amount: 'not a number' }, filter)).toBe(false);
    });
  });

  describe('in / nin operators', () => {
    it('in: value in array', () => {
      const filter: FilterExpression = {
        logic: 'and',
        conditions: [{ field: 'status', op: 'in', value: ['active', 'pending'] }],
      };
      expect(service.evaluate({ status: 'active' }, filter)).toBe(true);
      expect(service.evaluate({ status: 'pending' }, filter)).toBe(true);
      expect(service.evaluate({ status: 'deleted' }, filter)).toBe(false);
    });

    it('nin: value not in array', () => {
      const filter: FilterExpression = {
        logic: 'and',
        conditions: [{ field: 'type', op: 'nin', value: ['spam', 'junk'] }],
      };
      expect(service.evaluate({ type: 'normal' }, filter)).toBe(true);
      expect(service.evaluate({ type: 'spam' }, filter)).toBe(false);
    });
  });

  describe('contains operator', () => {
    it('string contains substring', () => {
      const filter: FilterExpression = {
        logic: 'and',
        conditions: [{ field: 'message', op: 'contains', value: 'error' }],
      };
      expect(service.evaluate({ message: 'an error occurred' }, filter)).toBe(true);
      expect(service.evaluate({ message: 'all good' }, filter)).toBe(false);
    });

    it('array contains element', () => {
      const filter: FilterExpression = {
        logic: 'and',
        conditions: [{ field: 'tags', op: 'contains', value: 'urgent' }],
      };
      expect(service.evaluate({ tags: ['urgent', 'bug'] }, filter)).toBe(true);
      expect(service.evaluate({ tags: ['feature'] }, filter)).toBe(false);
    });
  });

  describe('exists operator', () => {
    it('field exists (value=true)', () => {
      const filter: FilterExpression = {
        logic: 'and',
        conditions: [{ field: 'email', op: 'exists', value: true }],
      };
      expect(service.evaluate({ email: 'a@b.c' }, filter)).toBe(true);
      expect(service.evaluate({ name: 'test' }, filter)).toBe(false);
    });

    it('field does not exist (value=false)', () => {
      const filter: FilterExpression = {
        logic: 'and',
        conditions: [{ field: 'deleted', op: 'exists', value: false }],
      };
      expect(service.evaluate({ name: 'test' }, filter)).toBe(true);
      expect(service.evaluate({ deleted: true }, filter)).toBe(false);
    });

    it('field exists with null value', () => {
      const filter: FilterExpression = {
        logic: 'and',
        conditions: [{ field: 'value', op: 'exists', value: true }],
      };
      expect(service.evaluate({ value: null }, filter)).toBe(true);
    });
  });

  describe('dot-path traversal', () => {
    it('resolves nested fields', () => {
      const filter: FilterExpression = {
        logic: 'and',
        conditions: [{ field: 'order.status', op: 'eq', value: 'shipped' }],
      };
      expect(service.evaluate({ order: { status: 'shipped' } }, filter)).toBe(true);
      expect(service.evaluate({ order: { status: 'pending' } }, filter)).toBe(false);
    });

    it('resolves deeply nested fields', () => {
      const filter: FilterExpression = {
        logic: 'and',
        conditions: [{ field: 'order.items.0.price', op: 'gt', value: 500 }],
      };
      expect(service.evaluate({ order: { items: [{ price: 600 }] } }, filter)).toBe(true);
      expect(service.evaluate({ order: { items: [{ price: 400 }] } }, filter)).toBe(false);
    });

    it('returns false for missing nested path', () => {
      const filter: FilterExpression = {
        logic: 'and',
        conditions: [{ field: 'a.b.c', op: 'eq', value: 1 }],
      };
      expect(service.evaluate({ a: {} }, filter)).toBe(false);
      expect(service.evaluate({}, filter)).toBe(false);
    });
  });

  describe('logic: and', () => {
    it('all conditions must match', () => {
      const filter: FilterExpression = {
        logic: 'and',
        conditions: [
          { field: 'status', op: 'eq', value: 'active' },
          { field: 'amount', op: 'gt', value: 100 },
        ],
      };
      expect(service.evaluate({ status: 'active', amount: 200 }, filter)).toBe(true);
      expect(service.evaluate({ status: 'active', amount: 50 }, filter)).toBe(false);
      expect(service.evaluate({ status: 'inactive', amount: 200 }, filter)).toBe(false);
    });
  });

  describe('logic: or', () => {
    it('any condition can match', () => {
      const filter: FilterExpression = {
        logic: 'or',
        conditions: [
          { field: 'status', op: 'eq', value: 'cancelled' },
          { field: 'status', op: 'eq', value: 'refunded' },
        ],
      };
      expect(service.evaluate({ status: 'cancelled' }, filter)).toBe(true);
      expect(service.evaluate({ status: 'refunded' }, filter)).toBe(true);
      expect(service.evaluate({ status: 'active' }, filter)).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('handles null payload', () => {
      const filter: FilterExpression = {
        logic: 'and',
        conditions: [{ field: 'x', op: 'eq', value: 1 }],
      };
      expect(service.evaluate(null, filter)).toBe(false);
    });

    it('handles undefined payload', () => {
      const filter: FilterExpression = {
        logic: 'and',
        conditions: [{ field: 'x', op: 'eq', value: 1 }],
      };
      expect(service.evaluate(undefined, filter)).toBe(false);
    });

    it('handles primitive payload', () => {
      const filter: FilterExpression = {
        logic: 'and',
        conditions: [{ field: 'x', op: 'eq', value: 1 }],
      };
      expect(service.evaluate(42, filter)).toBe(false);
      expect(service.evaluate('string', filter)).toBe(false);
    });
  });
});
