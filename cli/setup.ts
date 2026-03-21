import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { STATE_FILE, type PluginState } from './paths';
import { detectRuntime, type Runtime } from './detect-runtime';
import { bunSetup } from './bun-setup';
import { dockerSetup } from './docker-setup';

const PLUGIN_ROOT = join(dirname(new URL(import.meta.url).pathname), '..');

export function buildDashboard(): void {
  const dashboardDir = join(PLUGIN_ROOT, 'dashboard');
  const distIndex = join(dashboardDir, 'dist', 'index.html');

  if (existsSync(distIndex)) {
    console.log('Dashboard already built, skipping.');
    return;
  }

  if (!existsSync(join(dashboardDir, 'package.json'))) {
    console.warn('Warning: dashboard source not found, skipping build.');
    return;
  }

  console.log('Building dashboard...');
  execFileSync('bun', ['install', '--frozen-lockfile'], { cwd: dashboardDir, stdio: 'inherit' });
  execFileSync('bun', ['run', 'build'], { cwd: dashboardDir, stdio: 'inherit' });
  console.log('Dashboard built successfully.\n');
}

export async function runSetup(preferredRuntime?: string): Promise<void> {
  // Check if already installed
  if (existsSync(STATE_FILE)) {
    const state: PluginState = JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
    console.log(`NATS plugin already installed (${state.runtime} mode, ${state.installedAt})`);
    console.log('Re-running setup to update...\n');
  }

  const runtime = await detectRuntime(preferredRuntime as Runtime | undefined);
  console.log(`Detected runtime: ${runtime}\n`);

  // Build dashboard SPA before anything else
  buildDashboard();

  if (runtime === 'bun') {
    await bunSetup();
  } else {
    await dockerSetup();
  }
}
