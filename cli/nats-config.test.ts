import { describe, test, expect } from 'bun:test';
import { generateNatsConfig } from './nats-config';

describe('generateNatsConfig', () => {
  test('generates config with JetStream enabled', () => {
    const config = generateNatsConfig({ dataDir: '/tmp/jetstream', port: 4222 });
    expect(config).toContain('jetstream');
    expect(config).toContain('store_dir: "/tmp/jetstream"');
    expect(config).toContain('port: 4222');
    expect(config).toContain('127.0.0.1');
  });

  test('uses custom port', () => {
    const config = generateNatsConfig({ dataDir: '/tmp/js', port: 4223 });
    expect(config).toContain('port: 4223');
  });
});
