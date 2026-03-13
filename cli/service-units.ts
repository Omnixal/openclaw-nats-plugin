import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
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

function isContainer(): boolean {
  try {
    return existsSync('/.dockerenv') || readFileSync('/proc/1/cgroup', 'utf-8').includes('docker');
  } catch {
    return false;
  }
}

function hasSystemctl(): boolean {
  try {
    execFileSync('systemctl', ['--version'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

export function getServiceManager(): 'systemd' | 'launchd' | 'direct' {
  if (platform() === 'darwin') return 'launchd';
  if (isContainer() || !hasSystemctl()) return 'direct';
  return 'systemd';
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

// --- Direct mode (containers / no init system) ---

function pidDir(): string {
  const dir = join(homedir(), '.openclaw', 'nats-plugin', 'pids');
  mkdirSync(dir, { recursive: true });
  return dir;
}

function pidFile(name: string): string {
  return join(pidDir(), `${name}.pid`);
}

function readPid(name: string): number | null {
  try {
    const pid = parseInt(readFileSync(pidFile(name), 'utf-8').trim(), 10);
    process.kill(pid, 0); // check if alive
    return pid;
  } catch {
    return null;
  }
}

// Stored commands for direct-mode start
const directCommands = new Map<string, { cmd: string; args: string[]; cwd: string; logFile: string }>();

export function registerDirectCommand(name: string, cmd: string, args: string[], cwd: string, logFile: string): void {
  directCommands.set(name, { cmd, args, cwd, logFile });
}

function startDirect(name: string): void {
  const entry = directCommands.get(name);
  if (!entry) throw new Error(`No command registered for service "${name}". Call registerDirectCommand first.`);

  const { cmd, args, cwd, logFile } = entry;
  const out = require('node:fs').openSync(logFile, 'a');
  const child = spawn(cmd, args, {
    cwd,
    stdio: ['ignore', out, out],
    detached: true,
  });
  child.unref();
  if (child.pid) {
    writeFileSync(pidFile(name), String(child.pid));
  }
}

function stopDirect(name: string): void {
  const pid = readPid(name);
  if (pid) {
    try { process.kill(pid, 'SIGTERM'); } catch { /* already dead */ }
    rmSync(pidFile(name), { force: true });
  }
}

function isRunningDirect(name: string): boolean {
  return readPid(name) !== null;
}

// --- Public API ---

export function startService(name: string): void {
  const mgr = getServiceManager();
  if (mgr === 'systemd') {
    execFileSync('systemctl', ['--user', 'enable', '--now', `${name}.service`]);
  } else if (mgr === 'launchd') {
    const plistPath = join(launchdAgentsDir(), `${name}.plist`);
    execFileSync('launchctl', ['load', '-w', plistPath]);
  } else {
    startDirect(name);
  }
}

export function stopService(name: string): void {
  const mgr = getServiceManager();
  if (mgr === 'systemd') {
    execFileSync('systemctl', ['--user', 'stop', `${name}.service`]);
  } else if (mgr === 'launchd') {
    const plistPath = join(launchdAgentsDir(), `${name}.plist`);
    execFileSync('launchctl', ['unload', plistPath]);
  } else {
    stopDirect(name);
  }
}

export function isServiceRunning(name: string): boolean {
  try {
    const mgr = getServiceManager();
    if (mgr === 'systemd') {
      const result = execFileSync('systemctl', ['--user', 'is-active', `${name}.service`], {
        encoding: 'utf-8',
      });
      return result.trim() === 'active';
    } else if (mgr === 'launchd') {
      const result = execFileSync('launchctl', ['list', name], { encoding: 'utf-8' });
      return result.includes(name);
    } else {
      return isRunningDirect(name);
    }
  } catch {
    return false;
  }
}

export function removeServiceUnit(name: string): void {
  const mgr = getServiceManager();
  if (mgr === 'systemd') {
    try { execFileSync('systemctl', ['--user', 'stop', `${name}.service`]); } catch { /* not running */ }
    try { execFileSync('systemctl', ['--user', 'disable', `${name}.service`]); } catch { /* not enabled */ }
    const filePath = join(systemdUserDir(), `${name}.service`);
    rmSync(filePath, { force: true });
    try { execFileSync('systemctl', ['--user', 'daemon-reload']); } catch { /* best effort */ }
  } else if (mgr === 'launchd') {
    const plistPath = join(launchdAgentsDir(), `${name}.plist`);
    try { execFileSync('launchctl', ['unload', plistPath]); } catch { /* may not be loaded */ }
    rmSync(plistPath, { force: true });
  } else {
    stopDirect(name);
    rmSync(pidFile(name), { force: true });
  }
}
