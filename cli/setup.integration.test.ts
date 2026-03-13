import { describe, test, expect } from 'bun:test';
import { detectRuntime } from './detect-runtime';
import { generateNatsConfig } from './nats-config';
import { mergeEnvContent, generateApiKey } from './env-writer';
import { generateSystemdUnit } from './service-units';
import { getNatsDownloadUrl, detectPlatform } from './download-nats';

describe('integration: full setup components', () => {
  test('detect runtime returns valid result', async () => {
    const runtime = await detectRuntime();
    expect(['bun', 'docker']).toContain(runtime);
  });

  test('nats config is valid', () => {
    const config = generateNatsConfig({ dataDir: '/tmp/test-js', port: 4222 });
    expect(config).toContain('jetstream');
    expect(config).toContain('127.0.0.1');
  });

  test('env merge works end-to-end', () => {
    const key = generateApiKey();
    const env = mergeEnvContent('EXISTING=value', {
      NATS_SIDECAR_URL: 'http://127.0.0.1:3104',
      NATS_PLUGIN_API_KEY: key,
    });
    expect(env).toContain('EXISTING=value');
    expect(env).toContain('NATS_SIDECAR_URL=http://127.0.0.1:3104');
    expect(env).toContain(`NATS_PLUGIN_API_KEY=${key}`);
  });

  test('systemd unit is valid', () => {
    const unit = generateSystemdUnit({
      name: 'test',
      description: 'Test service',
      execStart: '/usr/bin/test',
      args: [],
      workingDirectory: '/tmp',
    });
    expect(unit).toContain('[Unit]');
    expect(unit).toContain('[Service]');
    expect(unit).toContain('[Install]');
  });

  test('download url is correct for current platform', () => {
    const { os, arch } = detectPlatform();
    const url = getNatsDownloadUrl('2.10.24', os, arch);
    expect(url).toContain('github.com/nats-io/nats-server');
    expect(url).toContain(os);
    expect(url).toContain(arch);
  });
});
