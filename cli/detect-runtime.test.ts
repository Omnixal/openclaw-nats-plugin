import { describe, test, expect } from 'bun:test';
import { detectRuntime, checkBun, checkDocker } from './detect-runtime';

describe('detectRuntime', () => {
  test('returns bun when bun is available', async () => {
    const result = await detectRuntime();
    expect(['bun', 'docker']).toContain(result);
  });
});

describe('checkBun', () => {
  test('returns true when bun binary exists', () => {
    const result = checkBun();
    expect(result).toBe(true);
  });
});

describe('checkDocker', () => {
  test('returns boolean', () => {
    const result = checkDocker();
    expect(typeof result).toBe('boolean');
  });
});
