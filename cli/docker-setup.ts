import { mkdirSync, cpSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { PLUGIN_DIR, DOCKER_DIR, STATE_FILE, type PluginState } from './paths';
import { generateApiKey, writeEnvVariables } from './env-writer';

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

  // 5. Save state
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
