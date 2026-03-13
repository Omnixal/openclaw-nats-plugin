import { execFileSync } from 'node:child_process';

export function checkBun(): boolean {
  try {
    execFileSync('bun', ['--version'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

export function checkDocker(): boolean {
  try {
    execFileSync('docker', ['info'], { stdio: 'pipe', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

export type Runtime = 'bun' | 'docker';

export async function detectRuntime(preferred?: Runtime): Promise<Runtime> {
  if (preferred) {
    const check = preferred === 'bun' ? checkBun() : checkDocker();
    if (!check) {
      throw new Error(`Requested runtime "${preferred}" is not available`);
    }
    return preferred;
  }

  if (checkBun()) return 'bun';
  if (checkDocker()) return 'docker';

  throw new Error(
    'Neither Bun nor Docker found. Install one of:\n' +
    '  - Bun: https://bun.sh\n' +
    '  - Docker: https://docs.docker.com/get-docker/'
  );
}
