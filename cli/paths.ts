import { join } from 'node:path';
import { homedir } from 'node:os';

export const OPENCLAW_DIR = join(homedir(), '.openclaw');
export const PLUGIN_DIR = join(OPENCLAW_DIR, 'nats-plugin');
export const BIN_DIR = join(PLUGIN_DIR, 'bin');
export const SIDECAR_DIR = join(PLUGIN_DIR, 'sidecar');
export const DATA_DIR = join(PLUGIN_DIR, 'data');
export const JETSTREAM_DIR = join(DATA_DIR, 'jetstream');
export const NATS_SERVER_BIN = join(BIN_DIR, 'nats-server');
export const NATS_CONF = join(PLUGIN_DIR, 'nats-server.conf');
export const DOCKER_DIR = join(PLUGIN_DIR, 'docker');
export const OPENCLAW_ENV = join(OPENCLAW_DIR, '.env');
export const STATE_FILE = join(PLUGIN_DIR, 'state.json');

export interface PluginState {
  runtime: 'bun' | 'docker';
  installedAt: string;
  natsServerVersion?: string;
}
