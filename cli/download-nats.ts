import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, chmodSync, renameSync, rmSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { NATS_SERVER_BIN, BIN_DIR } from './paths';

const NATS_VERSION = '2.10.24';

export function detectPlatform(): { os: string; arch: string } {
  const platform = process.platform;
  const architecture = process.arch;

  if (platform !== 'darwin' && platform !== 'linux') {
    throw new Error(`Unsupported platform: ${platform}. Only linux and darwin are supported.`);
  }
  if (architecture !== 'arm64' && architecture !== 'x64') {
    throw new Error(`Unsupported architecture: ${architecture}. Only arm64 and x64 are supported.`);
  }

  const os = platform === 'darwin' ? 'darwin' : 'linux';
  const arch = architecture === 'arm64' ? 'arm64' : 'amd64';

  return { os, arch };
}

export function getNatsDownloadUrl(version: string, os: string, arch: string): string {
  return `https://github.com/nats-io/nats-server/releases/download/v${version}/nats-server-v${version}-${os}-${arch}.zip`;
}

export async function downloadNatsServer(): Promise<string> {
  if (existsSync(NATS_SERVER_BIN)) {
    console.log('nats-server already installed, skipping download');
    return NATS_SERVER_BIN;
  }

  const { os, arch } = detectPlatform();
  const url = getNatsDownloadUrl(NATS_VERSION, os, arch);
  const zipPath = join(BIN_DIR, 'nats-server.zip');
  const extractDir = join(BIN_DIR, 'nats-extract');

  mkdirSync(BIN_DIR, { recursive: true });

  console.log(`Downloading nats-server v${NATS_VERSION} (${os}/${arch})...`);

  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      execFileSync('curl', ['-fsSL', '-o', zipPath, url], { stdio: 'pipe', timeout: 120_000 });
      lastError = null;
      break;
    } catch (e) {
      lastError = e as Error;
      console.warn(`Download attempt ${attempt}/3 failed, retrying...`);
    }
  }

  if (lastError) {
    throw new Error(
      `Failed to download nats-server after 3 attempts.\n` +
      `Download manually from: ${url}\n` +
      `Place binary at: ${NATS_SERVER_BIN}`
    );
  }

  // Verify SHA256 checksum
  const checksumUrl = `https://github.com/nats-io/nats-server/releases/download/v${NATS_VERSION}/SHA256SUMS`;
  try {
    execFileSync('curl', ['-fsSL', '-o', join(BIN_DIR, 'SHA256SUMS'), checksumUrl], { stdio: 'pipe', timeout: 30_000 });

    const zipData = readFileSync(zipPath);
    const actualHash = createHash('sha256').update(zipData).digest('hex');
    const checksumContent = readFileSync(join(BIN_DIR, 'SHA256SUMS'), 'utf-8');
    const expectedLine = checksumContent.split('\n').find(line => line.includes(`nats-server-v${NATS_VERSION}-${os}-${arch}.zip`));
    if (expectedLine) {
      const expectedHash = expectedLine.split(/\s+/)[0];
      if (actualHash !== expectedHash) {
        rmSync(zipPath);
        throw new Error(`Checksum mismatch for nats-server download.\nExpected: ${expectedHash}\nActual:   ${actualHash}`);
      }
      console.log('Checksum verified');
    } else {
      console.warn('Warning: Could not find checksum for this platform, skipping verification');
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes('Checksum mismatch')) throw e;
    console.warn('Warning: Could not download checksums, skipping verification');
  } finally {
    const sumsPath = join(BIN_DIR, 'SHA256SUMS');
    if (existsSync(sumsPath)) rmSync(sumsPath);
  }

  try {
    mkdirSync(extractDir, { recursive: true });
    execFileSync('unzip', ['-o', zipPath, '-d', extractDir], { stdio: 'pipe' });

    const innerDir = `nats-server-v${NATS_VERSION}-${os}-${arch}`;
    const extractedBin = join(extractDir, innerDir, 'nats-server');

    renameSync(extractedBin, NATS_SERVER_BIN);
    chmodSync(NATS_SERVER_BIN, 0o755);
  } finally {
    if (existsSync(zipPath)) rmSync(zipPath);
    if (existsSync(extractDir)) rmSync(extractDir, { recursive: true });
  }

  console.log(`nats-server installed at ${NATS_SERVER_BIN}`);
  return NATS_SERVER_BIN;
}

export { NATS_VERSION };
