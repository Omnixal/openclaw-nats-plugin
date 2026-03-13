import { describe, test, expect } from 'bun:test';
import { generateSystemdUnit, generateLaunchdPlist, getServiceManager } from './service-units';

describe('generateSystemdUnit', () => {
  test('generates valid nats-server unit', () => {
    const unit = generateSystemdUnit({
      name: 'openclaw-nats',
      description: 'NATS Server for OpenClaw',
      execStart: '/home/user/.openclaw/nats-plugin/bin/nats-server',
      args: ['-c', '/home/user/.openclaw/nats-plugin/nats-server.conf'],
      workingDirectory: '/home/user/.openclaw/nats-plugin',
    });
    expect(unit).toContain('[Unit]');
    expect(unit).toContain('Description=NATS Server for OpenClaw');
    expect(unit).toContain('[Service]');
    expect(unit).toContain('ExecStart=/home/user/.openclaw/nats-plugin/bin/nats-server');
    expect(unit).toContain('[Install]');
    expect(unit).toContain('WantedBy=default.target');
    expect(unit).toContain('Restart=on-failure');
  });
});

describe('generateLaunchdPlist', () => {
  test('generates valid plist for nats-server', () => {
    const plist = generateLaunchdPlist({
      label: 'com.openclaw.nats',
      program: '/home/user/.openclaw/nats-plugin/bin/nats-server',
      programArguments: ['-c', '/home/user/.openclaw/nats-plugin/nats-server.conf'],
      workingDirectory: '/home/user/.openclaw/nats-plugin',
    });
    expect(plist).toContain('<?xml');
    expect(plist).toContain('<key>Label</key>');
    expect(plist).toContain('com.openclaw.nats');
    expect(plist).toContain('<key>KeepAlive</key>');
    expect(plist).toContain('<true/>');
  });
});

describe('getServiceManager', () => {
  test('returns systemd, launchd, or direct based on platform', () => {
    const manager = getServiceManager();
    expect(['systemd', 'launchd', 'direct']).toContain(manager);
  });
});
