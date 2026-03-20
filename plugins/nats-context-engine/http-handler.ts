import fs from 'node:fs/promises';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

const ROUTE_PREFIX = '/nats-dashboard';
const DIST_DIR = path.resolve(__dirname, '../../dashboard/dist');
const SIDECAR_URL = process.env.NATS_SIDECAR_URL || 'http://127.0.0.1:3104';
const API_KEY = process.env.NATS_PLUGIN_API_KEY || 'dev-nats-plugin-key';

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
    const targetUrl = `${SIDECAR_URL}${subPath}${search}`;
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

    const upstream = await fetch(targetUrl, {
      method: req.method || 'GET',
      headers,
      body,
      signal: AbortSignal.timeout(10000),
    });

    res.statusCode = upstream.status;
    res.setHeader('content-type', upstream.headers.get('content-type') || 'application/json');
    const responseBody = await upstream.text();
    res.end(responseBody);
  } catch {
    res.statusCode = 502;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'Sidecar unreachable' }));
  }
  return true;
}

const MAX_BODY_BYTES = 1_048_576; // 1MB

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
      res.end('Dashboard not built. Run: cd openclaw-nats-plugin/dashboard && bun run build');
    }
  }
  return true;
}
