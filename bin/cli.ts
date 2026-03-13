#!/usr/bin/env bun
import { parseArgs } from 'node:util';

const COMMANDS = ['setup', 'start', 'stop', 'status', 'uninstall'] as const;
type Command = typeof COMMANDS[number];

function printUsage(): void {
  console.log(`
Usage: npx @omnixal/openclaw-nats-plugin <command> [options]

Commands:
  setup       Install and start NATS + sidecar (auto-detects runtime)
  start       Start NATS + sidecar services
  stop        Stop NATS + sidecar services
  status      Check service health
  uninstall   Remove services and config

Options:
  --runtime=bun|docker   Force specific runtime (default: auto-detect)
  --help                 Show this help
`);
}

const args = process.argv.slice(2);
const command = args[0] as Command;

if (!command || command === '--help' || !COMMANDS.includes(command)) {
  printUsage();
  process.exit(command === '--help' ? 0 : 1);
}

const { values } = parseArgs({
  args: args.slice(1),
  options: {
    runtime: { type: 'string' },
    purge: { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  },
  strict: false,
});

if (values.help) {
  printUsage();
  process.exit(0);
}

const runtime = values.runtime as 'bun' | 'docker' | undefined;

switch (command) {
  case 'setup': {
    const { runSetup } = await import('../cli/setup.ts');
    await runSetup(runtime);
    break;
  }
  case 'start': {
    const { runStart } = await import('../cli/lifecycle.ts');
    await runStart();
    break;
  }
  case 'stop': {
    const { runStop } = await import('../cli/lifecycle.ts');
    await runStop();
    break;
  }
  case 'status': {
    const { runStatus } = await import('../cli/lifecycle.ts');
    await runStatus();
    break;
  }
  case 'uninstall': {
    const { runUninstall } = await import('../cli/lifecycle.ts');
    await runUninstall(values.purge as boolean);
    break;
  }
}
