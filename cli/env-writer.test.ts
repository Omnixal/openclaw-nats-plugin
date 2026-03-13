import { describe, test, expect } from 'bun:test';
import { mergeEnvContent, generateApiKey } from './env-writer';

describe('mergeEnvContent', () => {
  test('adds new variables to empty content', () => {
    const result = mergeEnvContent('', {
      NATS_SIDECAR_URL: 'http://localhost:3104',
      NATS_PLUGIN_API_KEY: 'test-key',
    });
    expect(result).toContain('NATS_SIDECAR_URL=http://localhost:3104');
    expect(result).toContain('NATS_PLUGIN_API_KEY=test-key');
  });

  test('updates existing variables', () => {
    const existing = 'FOO=bar\nNATS_SIDECAR_URL=old-url\nBAZ=qux';
    const result = mergeEnvContent(existing, {
      NATS_SIDECAR_URL: 'http://localhost:3104',
    });
    expect(result).toContain('NATS_SIDECAR_URL=http://localhost:3104');
    expect(result).toContain('FOO=bar');
    expect(result).toContain('BAZ=qux');
    expect(result).not.toContain('old-url');
  });

  test('preserves comments and blank lines', () => {
    const existing = '# My config\nFOO=bar\n\n# NATS stuff';
    const result = mergeEnvContent(existing, { NATS_SERVERS: 'nats://localhost:4222' });
    expect(result).toContain('# My config');
    expect(result).toContain('FOO=bar');
    expect(result).toContain('NATS_SERVERS=nats://localhost:4222');
  });
});

describe('generateApiKey', () => {
  test('returns 32-char hex string', () => {
    const key = generateApiKey();
    expect(key).toHaveLength(64);
    expect(key).toMatch(/^[a-f0-9]+$/);
  });

  test('generates unique keys', () => {
    const key1 = generateApiKey();
    const key2 = generateApiKey();
    expect(key1).not.toBe(key2);
  });
});
