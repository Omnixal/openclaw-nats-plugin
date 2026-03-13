import { existsSync, readFileSync } from 'node:fs';
import { STATE_FILE, type PluginState } from './paths';
import { detectRuntime, type Runtime } from './detect-runtime';
import { bunSetup } from './bun-setup';
import { dockerSetup } from './docker-setup';

export async function runSetup(preferredRuntime?: string): Promise<void> {
  // Check if already installed
  if (existsSync(STATE_FILE)) {
    const state: PluginState = JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
    console.log(`NATS plugin already installed (${state.runtime} mode, ${state.installedAt})`);
    console.log('Re-running setup to update...\n');
  }

  const runtime = await detectRuntime(preferredRuntime as Runtime | undefined);
  console.log(`Detected runtime: ${runtime}\n`);

  if (runtime === 'bun') {
    await bunSetup();
  } else {
    await dockerSetup();
  }
}
