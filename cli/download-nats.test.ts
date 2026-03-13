import { describe, test, expect } from 'bun:test';
import { getNatsDownloadUrl, detectPlatform } from './download-nats';

describe('detectPlatform', () => {
  test('returns valid os and arch', () => {
    const { os, arch } = detectPlatform();
    expect(['linux', 'darwin']).toContain(os);
    expect(['amd64', 'arm64']).toContain(arch);
  });
});

describe('getNatsDownloadUrl', () => {
  test('returns github release url for linux amd64', () => {
    const url = getNatsDownloadUrl('2.10.24', 'linux', 'amd64');
    expect(url).toBe(
      'https://github.com/nats-io/nats-server/releases/download/v2.10.24/nats-server-v2.10.24-linux-amd64.tar.gz'
    );
  });

  test('returns github release url for darwin arm64', () => {
    const url = getNatsDownloadUrl('2.10.24', 'darwin', 'arm64');
    expect(url).toBe(
      'https://github.com/nats-io/nats-server/releases/download/v2.10.24/nats-server-v2.10.24-darwin-arm64.tar.gz'
    );
  });
});
