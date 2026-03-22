import { mkdirSync, cpSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { PLUGIN_DIR, DOCKER_DIR, DASHBOARD_DIR, STATE_FILE, type PluginState } from './paths';
import { generateApiKey, writeEnvVariables } from './env-writer';

/**
 * Try to copy dashboard dist into a running OpenClaw container's volume.
 * This handles the case where setup runs on the host but OpenClaw is in Docker.
 */
function copyDashboardToContainer(dashboardDir: string): void {
  if (!existsSync(join(dashboardDir, 'index.html'))) return;

  const candidates = ['openclaw-gateway', 'openclaw-cli'];
  for (const container of candidates) {
    try {
      const status = execFileSync(
        'docker', ['inspect', '--format={{.State.Running}}', container],
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
      ).trim();
      if (status !== 'true') continue;

      const home = execFileSync(
        'docker', ['exec', container, 'sh', '-c', 'echo $HOME'],
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
      ).trim();

      const remotePath = `${home}/.openclaw/nats-plugin/dashboard`;
      execFileSync('docker', ['exec', container, 'mkdir', '-p', remotePath]);
      execFileSync('docker', ['cp', `${dashboardDir}/.`, `${container}:${remotePath}/`]);
      console.log(`Dashboard copied into container '${container}' at ${remotePath}`);
      return;
    } catch {
      // Container not found or not running, try next
    }
  }
  console.log('Note: No running OpenClaw container found. Dashboard will be served after setup runs inside the container.');
}

export async function dockerSetup(): Promise<void> {
  console.log('Setting up NATS plugin (Docker mode)...\n');

  mkdirSync(DOCKER_DIR, { recursive: true });

  // 1. Copy docker compose and sidecar source
  const pluginRoot = join(dirname(new URL(import.meta.url).pathname), '..');
  const templateDir = join(pluginRoot, 'docker');
  const sidecarSrc = join(pluginRoot, 'sidecar');

  if (!existsSync(join(templateDir, 'docker-compose.yml'))) {
    throw new Error(`Docker compose template not found at ${templateDir}`);
  }

  if (!existsSync(sidecarSrc)) {
    throw new Error(`Sidecar source not found at ${sidecarSrc}. The plugin package may be incomplete.`);
  }

  cpSync(templateDir, DOCKER_DIR, { recursive: true });
  cpSync(sidecarSrc, join(DOCKER_DIR, 'sidecar'), { recursive: true });

  // 2. Generate API key and write .env for compose
  const apiKey = generateApiKey();
  writeFileSync(join(DOCKER_DIR, '.env'), `NATS_PLUGIN_API_KEY=${apiKey}\n`);

  // 3. Build and start
  console.log('Building and starting containers...');
  execFileSync('docker', ['compose', 'up', '-d', '--build'], { cwd: DOCKER_DIR, stdio: 'inherit' });

  // 4. Write env variables for OpenClaw
  writeEnvVariables({
    NATS_SIDECAR_URL: 'http://127.0.0.1:3104',
    NATS_PLUGIN_API_KEY: apiKey,
    NATS_SERVERS: 'nats://127.0.0.1:4222',
  });

  // 5. Copy dashboard dist into OpenClaw container (host→container bridge)
  copyDashboardToContainer(DASHBOARD_DIR);

  // 6. Save state
  const state: PluginState = {
    runtime: 'docker',
    installedAt: new Date().toISOString(),
  };
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

  console.log('\nNATS plugin setup complete (Docker mode)');
  console.log('  NATS server:  127.0.0.1:4222');
  console.log('  Sidecar:      127.0.0.1:3104');
  console.log('\nRestart OpenClaw gateway to activate the plugin.');
}
