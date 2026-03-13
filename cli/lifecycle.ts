import { existsSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { STATE_FILE, PLUGIN_DIR, DOCKER_DIR, type PluginState } from './paths';
import {
  startService, stopService, isServiceRunning, removeServiceUnit,
} from './service-units';

const NATS_SERVICE = 'openclaw-nats';
const SIDECAR_SERVICE = 'openclaw-nats-sidecar';

function loadState(): PluginState {
  if (!existsSync(STATE_FILE)) {
    throw new Error('NATS plugin not installed. Run: npx @omnixal/openclaw-nats-plugin setup');
  }
  return JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
}

export async function runStart(): Promise<void> {
  const state = loadState();

  if (state.runtime === 'bun') {
    startService(NATS_SERVICE);
    startService(SIDECAR_SERVICE);
    console.log('NATS services started');
  } else {
    execFileSync('docker', ['compose', 'up', '-d'], { cwd: DOCKER_DIR, stdio: 'inherit' });
    console.log('NATS containers started');
  }
}

export async function runStop(): Promise<void> {
  const state = loadState();

  if (state.runtime === 'bun') {
    stopService(SIDECAR_SERVICE);
    stopService(NATS_SERVICE);
    console.log('NATS services stopped');
  } else {
    execFileSync('docker', ['compose', 'stop'], { cwd: DOCKER_DIR, stdio: 'inherit' });
    console.log('NATS containers stopped');
  }
}

export async function runStatus(): Promise<void> {
  const state = loadState();

  console.log(`Runtime: ${state.runtime}`);
  console.log(`Installed: ${state.installedAt}\n`);

  if (state.runtime === 'bun') {
    const natsRunning = isServiceRunning(NATS_SERVICE);
    const sidecarRunning = isServiceRunning(SIDECAR_SERVICE);
    console.log(`NATS server:  ${natsRunning ? 'running' : 'stopped'}`);
    console.log(`Sidecar:      ${sidecarRunning ? 'running' : 'stopped'}`);
  } else {
    try {
      execFileSync('docker', ['compose', 'ps'], { cwd: DOCKER_DIR, stdio: 'inherit' });
    } catch {
      console.log('Docker containers not found');
    }
  }

  // Check connectivity
  try {
    const res = await fetch('http://127.0.0.1:3104/metrics', {
      signal: AbortSignal.timeout(3000),
    });
    console.log(`\nSidecar API:  ${res.ok ? 'healthy' : 'unhealthy'}`);
  } catch {
    console.log('\nSidecar API:  unreachable');
  }

  try {
    const res = await fetch('http://127.0.0.1:8222/healthz', {
      signal: AbortSignal.timeout(3000),
    });
    console.log(`NATS health:  ${res.ok ? 'healthy' : 'unhealthy'}`);
  } catch {
    console.log('NATS health:  unreachable');
  }
}

export async function runUninstall(purge: boolean): Promise<void> {
  const state = loadState();

  console.log(`Uninstalling NATS plugin (${state.runtime} mode)...`);

  if (state.runtime === 'bun') {
    removeServiceUnit(SIDECAR_SERVICE);
    removeServiceUnit(NATS_SERVICE);
  } else {
    try {
      execFileSync('docker', ['compose', 'down'], { cwd: DOCKER_DIR, stdio: 'inherit' });
    } catch {
      // Containers might not exist
    }
  }

  if (purge) {
    console.log('Purging all data...');
    rmSync(PLUGIN_DIR, { recursive: true, force: true });
  } else {
    rmSync(STATE_FILE, { force: true });
    console.log('Services removed. Data preserved at ' + PLUGIN_DIR);
    console.log('Use --purge to remove all data.');
  }

  console.log('Uninstall complete.');
}
