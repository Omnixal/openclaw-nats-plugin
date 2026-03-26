import fs from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';

const ROUTE_PREFIX = '/nats-dashboard';
const SIDECAR_URL = process.env.NATS_SIDECAR_URL || 'http://127.0.0.1:3104';
const API_KEY = process.env.NATS_PLUGIN_API_KEY || 'dev-nats-plugin-key';
const sidecarParsed = new URL(SIDECAR_URL);

// Stable location (copied during setup) takes priority over in-package dist
const STABLE_DIST = path.join(homedir(), '.openclaw', 'nats-plugin', 'dashboard');
const PACKAGE_DIST = path.resolve(__dirname, '../../dashboard/dist');
const DIST_DIR = existsSync(path.join(STABLE_DIST, 'index.html')) ? STABLE_DIST : PACKAGE_DIST;

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

export function createDashboardHandler() {
  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const subPath = url.pathname.slice(ROUTE_PREFIX.length);

    // API proxy: /nats-dashboard/api/* → sidecar
    if (subPath.startsWith('/api/')) {
      return proxyToSidecar(subPath, url.search, req, res);
    }

    // Static files
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.statusCode = 405;
      res.end('Method Not Allowed');
      return true;
    }

    return serveStatic(subPath, res);
  };
}

async function proxyToSidecar(
  subPath: string,
  search: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  try {
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${API_KEY}`,
    };
    if (req.headers['content-type']) {
      headers['Content-Type'] = req.headers['content-type'];
    }

    let body: string | undefined;
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
      body = await readBody(req);
    }

    // Use node:http directly — global fetch() may be intercepted by gateway SSRF guards
    const upstream = await httpRequest({
      hostname: sidecarParsed.hostname,
      port: Number(sidecarParsed.port),
      path: `${subPath}${search}`,
      method: req.method || 'GET',
      headers,
      timeout: 10_000,
    }, body);

    res.statusCode = upstream.statusCode;
    res.setHeader('content-type', upstream.headers['content-type'] || 'application/json');
    res.end(upstream.body);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[nats-dashboard] Sidecar proxy error: ${message} (url=${SIDECAR_URL}${subPath})`);
    res.statusCode = 502;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'Sidecar unreachable', detail: message }));
  }
  return true;
}

const MAX_BODY_BYTES = 1_048_576; // 1MB

interface HttpResponse {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

function httpRequest(
  opts: http.RequestOptions,
  body?: string,
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const req = http.request(opts, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode || 500,
          headers: res.headers,
          body: Buffer.concat(chunks).toString(),
        });
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    if (body) req.write(body);
    req.end();
  });
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) { req.destroy(); reject(new Error('Body too large')); return; }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

async function serveStatic(subPath: string, res: ServerResponse): Promise<boolean> {
  let filePath = subPath || '/index.html';
  if (filePath === '/') filePath = '/index.html';

  const fullPath = path.join(DIST_DIR, filePath);

  // Prevent directory traversal
  if (!fullPath.startsWith(DIST_DIR)) {
    res.statusCode = 403;
    res.end('Forbidden');
    return true;
  }

  try {
    const body = await fs.readFile(fullPath);
    const ext = path.extname(fullPath);
    res.statusCode = 200;
    res.setHeader('content-type', MIME_TYPES[ext] || 'application/octet-stream');
    res.setHeader('cache-control', ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable');
    res.end(body);
  } catch {
    // SPA fallback
    try {
      const indexHtml = await fs.readFile(path.join(DIST_DIR, 'index.html'));
      res.statusCode = 200;
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.setHeader('cache-control', 'no-cache');
      res.end(indexHtml);
    } catch {
      res.statusCode = 404;
      res.end('Dashboard not built. Run: npx @omnixal/openclaw-nats-plugin setup');
    }
  }
  return true;
}
