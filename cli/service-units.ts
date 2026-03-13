import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { homedir, platform } from 'node:os';

// --- Interfaces ---

export interface SystemdUnitOptions {
  name: string;
  description: string;
  execStart: string;
  args: string[];
  workingDirectory: string;
  after?: string;
}

export interface LaunchdPlistOptions {
  label: string;
  program: string;
  programArguments: string[];
  workingDirectory: string;
}

// --- Detection ---

export function getServiceManager(): 'systemd' | 'launchd' {
  return platform() === 'darwin' ? 'launchd' : 'systemd';
}

// --- Generators ---

export function generateSystemdUnit(opts: SystemdUnitOptions): string {
  const after = opts.after ?? 'network.target';
  const execLine = [opts.execStart, ...opts.args].join(' ');

  return `[Unit]
Description=${opts.description}
After=${after}

[Service]
Type=simple
ExecStart=${execLine}
WorkingDirectory=${opts.workingDirectory}
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
`;
}

export function generateLaunchdPlist(opts: LaunchdPlistOptions): string {
  const allArgs = [opts.program, ...opts.programArguments];
  const argsXml = allArgs.map((a) => `      <string>${escapeXml(a)}</string>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${escapeXml(opts.label)}</string>
    <key>ProgramArguments</key>
    <array>
${argsXml}
    </array>
    <key>WorkingDirectory</key>
    <string>${escapeXml(opts.workingDirectory)}</string>
    <key>KeepAlive</key>
    <true/>
    <key>RunAtLoad</key>
    <true/>
</dict>
</plist>
`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// --- Install / manage ---

function systemdUserDir(): string {
  return join(homedir(), '.config', 'systemd', 'user');
}

function launchdAgentsDir(): string {
  return join(homedir(), 'Library', 'LaunchAgents');
}

export function installSystemdUnit(name: string, content: string): void {
  const dir = systemdUserDir();
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, `${name}.service`);
  writeFileSync(filePath, content, 'utf-8');
  execFileSync('systemctl', ['--user', 'daemon-reload']);
}

export function installLaunchdPlist(label: string, content: string): void {
  const dir = launchdAgentsDir();
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, `${label}.plist`);
  writeFileSync(filePath, content, 'utf-8');
}

export function startService(name: string): void {
  if (getServiceManager() === 'systemd') {
    execFileSync('systemctl', ['--user', 'enable', '--now', `${name}.service`]);
  } else {
    const plistPath = join(launchdAgentsDir(), `${name}.plist`);
    execFileSync('launchctl', ['load', '-w', plistPath]);
  }
}

export function stopService(name: string): void {
  if (getServiceManager() === 'systemd') {
    execFileSync('systemctl', ['--user', 'stop', `${name}.service`]);
  } else {
    const plistPath = join(launchdAgentsDir(), `${name}.plist`);
    execFileSync('launchctl', ['unload', plistPath]);
  }
}

export function isServiceRunning(name: string): boolean {
  try {
    if (getServiceManager() === 'systemd') {
      const result = execFileSync('systemctl', ['--user', 'is-active', `${name}.service`], {
        encoding: 'utf-8',
      });
      return result.trim() === 'active';
    } else {
      const result = execFileSync('launchctl', ['list', name], { encoding: 'utf-8' });
      return result.includes(name);
    }
  } catch {
    return false;
  }
}

export function removeServiceUnit(name: string): void {
  if (getServiceManager() === 'systemd') {
    try {
      execFileSync('systemctl', ['--user', 'stop', `${name}.service`]);
    } catch {
      // service may not be running
    }
    try {
      execFileSync('systemctl', ['--user', 'disable', `${name}.service`]);
    } catch {
      // service may not be enabled
    }
    const filePath = join(systemdUserDir(), `${name}.service`);
    rmSync(filePath, { force: true });
    try {
      execFileSync('systemctl', ['--user', 'daemon-reload']);
    } catch {
      // best effort
    }
  } else {
    const plistPath = join(launchdAgentsDir(), `${name}.plist`);
    try {
      execFileSync('launchctl', ['unload', plistPath]);
    } catch {
      // may not be loaded
    }
    rmSync(plistPath, { force: true });
  }
}
