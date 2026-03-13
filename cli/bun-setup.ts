import { mkdirSync, existsSync, cpSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import {
  PLUGIN_DIR, SIDECAR_DIR, DATA_DIR, JETSTREAM_DIR, BIN_DIR,
  NATS_SERVER_BIN, STATE_FILE, NATS_CONF, type PluginState,
} from './paths';
import { downloadNatsServer, NATS_VERSION } from './download-nats';
import { writeNatsConfig } from './nats-config';
import { generateApiKey, getExistingApiKey, writeEnvVariables } from './env-writer';
import {
  getServiceManager, generateSystemdUnit, generateLaunchdPlist,
  installSystemdUnit, installLaunchdPlist, startService, stopService,
} from './service-units';

const NATS_SERVICE = 'openclaw-nats';
const SIDECAR_SERVICE = 'openclaw-nats-sidecar';

export async function bunSetup(): Promise<void> {
  console.log('Setting up NATS plugin (Bun mode)...\n');

  // 1. Create directories
  for (const dir of [PLUGIN_DIR, BIN_DIR, SIDECAR_DIR, DATA_DIR, JETSTREAM_DIR]) {
    mkdirSync(dir, { recursive: true });
  }
  mkdirSync(join(PLUGIN_DIR, 'logs'), { recursive: true });

  // 2. Download nats-server
  await downloadNatsServer();

  // 3. Copy sidecar source into plugin dir
  // When installed via npm, the sidecar/ dir is inside the package
  const pluginRoot = join(dirname(new URL(import.meta.url).pathname), '..');
  const sidecarSrc = join(pluginRoot, 'sidecar');
  if (existsSync(sidecarSrc)) {
    console.log('Copying sidecar source...');
    cpSync(sidecarSrc, SIDECAR_DIR, { recursive: true });
  } else {
    throw new Error(`Sidecar source not found at ${sidecarSrc}`);
  }

  // 4. Install sidecar dependencies
  console.log('Installing sidecar dependencies...');
  execFileSync('bun', ['install', '--frozen-lockfile'], { cwd: SIDECAR_DIR, stdio: 'inherit' });

  // 5. Generate NATS config
  writeNatsConfig();

  // 6. Reuse existing API key or generate new one
  const apiKey = getExistingApiKey() ?? generateApiKey();

  // 7. Write env variables (to OpenClaw .env for hooks, and sidecar .env for the service)
  const envVars: Record<string, string> = {
    NATS_SIDECAR_URL: 'http://127.0.0.1:3104',
    NATS_PLUGIN_API_KEY: apiKey,
    NATS_SERVERS: 'nats://127.0.0.1:4222',
  };
  writeEnvVariables(envVars);

  // Write .env into sidecar dir so loadDotEnv picks it up
  // Explicit localhost values override any container-level env (e.g. OPENCLAW_WS_URL=ws://openclaw:...)
  const sidecarEnv = [
    `PORT=3104`,
    `DB_PATH=${join(DATA_DIR, 'nats-sidecar.db')}`,
    `NATS_SERVERS=nats://127.0.0.1:4222`,
    `NATS_PLUGIN_API_KEY=${apiKey}`,
    `OPENCLAW_WS_URL=ws://127.0.0.1:18789`,
  ].join('\n');
  writeFileSync(join(SIDECAR_DIR, '.env'), sidecarEnv, 'utf-8');

  // 8. Generate and install service units
  const manager = getServiceManager();

  if (manager === 'systemd') {
    const natsUnit = generateSystemdUnit({
      name: NATS_SERVICE,
      description: 'NATS Server for OpenClaw',
      execStart: NATS_SERVER_BIN,
      args: ['-c', NATS_CONF],
      workingDirectory: PLUGIN_DIR,
    });
    installSystemdUnit(NATS_SERVICE, natsUnit);

    const sidecarUnit = generateSystemdUnit({
      name: SIDECAR_SERVICE,
      description: 'NATS Sidecar for OpenClaw',
      execStart: 'bun',
      args: ['run', join(SIDECAR_DIR, 'src/index.ts')],
      workingDirectory: SIDECAR_DIR,
      after: `${NATS_SERVICE}.service`,
    });
    installSystemdUnit(SIDECAR_SERVICE, sidecarUnit);
  } else if (manager === 'launchd') {
    const natsPlist = generateLaunchdPlist({
      label: 'com.openclaw.nats',
      program: NATS_SERVER_BIN,
      programArguments: ['-c', NATS_CONF],
      workingDirectory: PLUGIN_DIR,
    });
    installLaunchdPlist('com.openclaw.nats', natsPlist);

    const sidecarPlist = generateLaunchdPlist({
      label: 'com.openclaw.nats-sidecar',
      program: 'bun',
      programArguments: ['run', join(SIDECAR_DIR, 'src/index.ts')],
      workingDirectory: SIDECAR_DIR,
    });
    installLaunchdPlist('com.openclaw.nats-sidecar', sidecarPlist);
  } else {
    // Direct mode — containers or systems without init
    console.log('No init system detected, using direct process management');
  }

  // 9. Stop old processes if running, then start
  try { stopService(SIDECAR_SERVICE); } catch { /* not running */ }
  try { stopService(NATS_SERVICE); } catch { /* not running */ }

  console.log('\nStarting services...');
  startService(NATS_SERVICE);
  await waitForPort(8222, 10_000);
  startService(SIDECAR_SERVICE);

  // 10. Save state
  const state: PluginState = {
    runtime: 'bun',
    installedAt: new Date().toISOString(),
    natsServerVersion: NATS_VERSION,
  };
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

  console.log('\nNATS plugin setup complete (Bun mode)');
  console.log('  NATS server:  127.0.0.1:4222');
  console.log('  Sidecar:      127.0.0.1:3104');
  console.log('\nRestart OpenClaw gateway to activate the plugin.');
}

async function waitForPort(port: number, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`, {
        signal: AbortSignal.timeout(1000),
      });
      if (res.ok || res.status === 404) return;
    } catch {
      // Not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  console.warn(`Warning: port ${port} not ready after ${timeoutMs}ms`);
}
