import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  generateIdentity,
  loadOrCreateIdentity,
  publicKeyToBase64Url,
  signChallenge,
} from './device-identity';

describe('device-identity', () => {
  describe('generateIdentity', () => {
    it('generates valid Ed25519 identity with hex deviceId', () => {
      const identity = generateIdentity();
      expect(identity.deviceId).toMatch(/^[0-9a-f]{64}$/);
      expect(identity.publicKeyPem).toContain('BEGIN PUBLIC KEY');
      expect(identity.privateKeyPem).toContain('BEGIN PRIVATE KEY');
    });

    it('derives deviceId as SHA-256 of raw public key', () => {
      const identity = generateIdentity();
      const pubKey = crypto.createPublicKey(identity.publicKeyPem);
      const spki = pubKey.export({ type: 'spki', format: 'der' }) as Buffer;
      // Ed25519 SPKI = 12 bytes prefix + 32 bytes raw key
      const raw = spki.subarray(12);
      const expected = crypto.createHash('sha256').update(raw).digest('hex');
      expect(identity.deviceId).toBe(expected);
    });

    it('generates unique identities each time', () => {
      const a = generateIdentity();
      const b = generateIdentity();
      expect(a.deviceId).not.toBe(b.deviceId);
    });
  });

  describe('loadOrCreateIdentity', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'device-identity-test-'));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('creates new identity when file does not exist', () => {
      const filePath = path.join(tmpDir, 'identity.json');
      const identity = loadOrCreateIdentity(filePath);
      expect(identity.deviceId).toMatch(/^[0-9a-f]{64}$/);
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('loads existing identity from file', () => {
      const filePath = path.join(tmpDir, 'identity.json');
      const first = loadOrCreateIdentity(filePath);
      const second = loadOrCreateIdentity(filePath);
      expect(second.deviceId).toBe(first.deviceId);
      expect(second.publicKeyPem).toBe(first.publicKeyPem);
    });

    it('creates parent directories if needed', () => {
      const filePath = path.join(tmpDir, 'nested', 'dir', 'identity.json');
      const identity = loadOrCreateIdentity(filePath);
      expect(identity.deviceId).toMatch(/^[0-9a-f]{64}$/);
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('regenerates identity if file is corrupted', () => {
      const filePath = path.join(tmpDir, 'identity.json');
      fs.writeFileSync(filePath, 'not-json');
      const identity = loadOrCreateIdentity(filePath);
      expect(identity.deviceId).toMatch(/^[0-9a-f]{64}$/);
    });

    it('re-derives deviceId if stored value is wrong', () => {
      const filePath = path.join(tmpDir, 'identity.json');
      const original = loadOrCreateIdentity(filePath);
      // Corrupt the deviceId
      const stored = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      stored.deviceId = 'aaaa'.repeat(16);
      fs.writeFileSync(filePath, JSON.stringify(stored));
      const loaded = loadOrCreateIdentity(filePath);
      expect(loaded.deviceId).toBe(original.deviceId);
    });
  });

  describe('publicKeyToBase64Url', () => {
    it('returns base64url-encoded 32-byte raw key', () => {
      const identity = generateIdentity();
      const b64 = publicKeyToBase64Url(identity.publicKeyPem);
      // base64url of 32 bytes = 43 chars (no padding)
      expect(b64).toMatch(/^[A-Za-z0-9_-]{43}$/);
    });
  });

  describe('signChallenge', () => {
    it('produces a valid Ed25519 signature verifiable with public key', () => {
      const identity = generateIdentity();
      const params = {
        deviceId: identity.deviceId,
        clientId: 'gateway-client',
        clientMode: 'backend',
        role: 'operator',
        scopes: ['operator.read', 'operator.write'],
        signedAtMs: Date.now(),
        token: 'test-token',
        nonce: 'test-nonce-123',
        platform: 'linux',
        deviceFamily: undefined,
      };

      const sig = signChallenge(identity.privateKeyPem, params);
      expect(sig).toMatch(/^[A-Za-z0-9_-]+$/); // base64url

      // Verify the signature manually
      const scopes = params.scopes.join(',');
      const payload = [
        'v3', params.deviceId, params.clientId, params.clientMode,
        params.role, scopes, String(params.signedAtMs), params.token,
        params.nonce, 'linux', '',
      ].join('|');

      // Decode base64url
      const normalized = sig.replaceAll('-', '+').replaceAll('_', '/');
      const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
      const sigBuf = Buffer.from(padded, 'base64');
      const pubKey = crypto.createPublicKey(identity.publicKeyPem);
      const valid = crypto.verify(null, Buffer.from(payload, 'utf8'), pubKey, sigBuf);
      expect(valid).toBe(true);
    });

    it('normalizes platform to lowercase ASCII', () => {
      const identity = generateIdentity();
      const nonce = 'nonce-1';
      const signedAtMs = 1700000000000;

      const sig1 = signChallenge(identity.privateKeyPem, {
        deviceId: identity.deviceId, clientId: 'cli', clientMode: 'cli',
        role: 'operator', scopes: ['operator.read'], signedAtMs,
        token: 'tok', nonce, platform: 'Linux',
      });
      const sig2 = signChallenge(identity.privateKeyPem, {
        deviceId: identity.deviceId, clientId: 'cli', clientMode: 'cli',
        role: 'operator', scopes: ['operator.read'], signedAtMs,
        token: 'tok', nonce, platform: 'linux',
      });
      expect(sig1).toBe(sig2);
    });
  });
});
