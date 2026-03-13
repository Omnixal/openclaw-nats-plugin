const SIDECAR_URL = process.env.NATS_SIDECAR_URL || 'http://127.0.0.1:3104';
const API_KEY = process.env.NATS_PLUGIN_API_KEY || 'dev-nats-plugin-key';

export async function publishToSidecar(
  subject: string,
  payload: unknown,
  meta?: Record<string, unknown>,
): Promise<boolean> {
  try {
    const res = await fetch(`${SIDECAR_URL}/api/publish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({ subject, payload, meta }),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
