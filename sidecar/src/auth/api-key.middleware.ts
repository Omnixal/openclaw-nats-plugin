import { Middleware, BaseMiddleware, type OneBunRequest, type OneBunResponse } from '@onebun/core';

export type CallerIdentity = 'plugin';

@Middleware()
export class ApiKeyMiddleware extends BaseMiddleware {
  private pluginApiKey!: string;

  constructor() {
    super();
    this.pluginApiKey = this.config.get('auth.pluginApiKey') as string;
  }

  async use(req: OneBunRequest, next: () => Promise<OneBunResponse>): Promise<OneBunResponse> {
    const authHeader = req.headers.get('Authorization');

    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : authHeader;

    if (token !== this.pluginApiKey) {
      this.logger.warn('Invalid API key attempt');
      return new Response(JSON.stringify({ error: 'Invalid API key' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    req.headers.set('x-caller', 'plugin');
    return next();
  }
}
