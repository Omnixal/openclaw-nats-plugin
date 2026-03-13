import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname } from 'node:path';
import { OPENCLAW_ENV } from './paths';

export function generateApiKey(): string {
  return randomBytes(32).toString('hex');
}

export function getExistingApiKey(): string | null {
  if (!existsSync(OPENCLAW_ENV)) return null;
  const content = readFileSync(OPENCLAW_ENV, 'utf-8');
  const match = content.match(/^NATS_PLUGIN_API_KEY=(.+)$/m);
  return match?.[1]?.trim() || null;
}

export function mergeEnvContent(
  existingContent: string,
  variables: Record<string, string>,
): string {
  const lines = existingContent.split('\n');
  const updatedKeys = new Set<string>();

  const updatedLines = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return line;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) return line;

    const key = trimmed.slice(0, eqIndex);
    if (key in variables) {
      updatedKeys.add(key);
      return `${key}=${variables[key]}`;
    }
    return line;
  });

  const newVars = Object.entries(variables)
    .filter(([key]) => !updatedKeys.has(key))
    .map(([key, value]) => `${key}=${value}`);

  if (newVars.length > 0) {
    const lastLine = updatedLines[updatedLines.length - 1]?.trim();
    if (lastLine !== '' && updatedLines.length > 0) {
      updatedLines.push('');
    }
    updatedLines.push('# NATS Plugin');
    updatedLines.push(...newVars);
  }

  return updatedLines.join('\n');
}

export function writeEnvVariables(variables: Record<string, string>): void {
  mkdirSync(dirname(OPENCLAW_ENV), { recursive: true });

  const existing = existsSync(OPENCLAW_ENV)
    ? readFileSync(OPENCLAW_ENV, 'utf-8')
    : '';

  const merged = mergeEnvContent(existing, variables);
  writeFileSync(OPENCLAW_ENV, merged, 'utf-8');
  console.log(`Environment variables written to ${OPENCLAW_ENV}`);
}
