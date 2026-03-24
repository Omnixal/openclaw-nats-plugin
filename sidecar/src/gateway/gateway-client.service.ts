import { Service, BaseService, type OnModuleInit } from '@onebun/core';
import { HttpClient, isErrorResponse } from '@onebun/requests';

export interface GatewayInjectPayload {
  message: string;
  eventId?: string;
}

export class GatewayRpcError extends Error {
  constructor(
    public readonly rpcId: string,
    public readonly errorCode: string,
    public readonly errorMessage: string,
  ) {
    super(`Gateway RPC error [${rpcId}]: ${errorCode} — ${errorMessage}`);
    this.name = 'GatewayRpcError';
  }
}

@Service()
export class GatewayClientService extends BaseService implements OnModuleInit {
  private client!: HttpClient;
  private configured = false;
  private requestId = 0;

  async onModuleInit(): Promise<void> {
    const gatewayUrl = this.config.get('gateway.url');
    const hookToken = this.config.get('gateway.hookToken');

    if (gatewayUrl && hookToken) {
      this.client = new HttpClient({
        baseUrl: gatewayUrl,
        timeout: 10_000,
        auth: { type: 'bearer', token: hookToken },
        retries: {
          max: 2,
          backoff: 'exponential',
          delay: 500,
          retryOn: [502, 503, 504],
        },
      });
      this.configured = true;
      this.logger.info('Gateway webhook configured', { url: gatewayUrl });
    } else {
      this.logger.warn('Gateway webhook not configured — need url + hookToken');
    }
  }

  async inject(payload: GatewayInjectPayload): Promise<void> {
    if (!this.configured) {
      throw new Error('Gateway webhook not configured');
    }
    const id = `rpc-${++this.requestId}`;

    const response = await this.client.post('/hooks/wake', {
      text: payload.message,
      mode: 'now',
    });

    if (isErrorResponse(response)) {
      throw new GatewayRpcError(id, String(response.code), response.message ?? response.error);
    }
  }

  isAlive(): boolean {
    return this.configured;
  }
}
