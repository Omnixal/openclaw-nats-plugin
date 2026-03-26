export interface FilterCondition {
  field: string;   // dot-path: "amount", "order.status", "tags.0"
  op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'nin' | 'contains' | 'exists';
  value: unknown;
}

export interface FilterExpression {
  logic: 'and' | 'or';    // default 'and'
  conditions: FilterCondition[];
}
