import { Service, BaseService, type OnModuleInit, type OnModuleDestroy } from '@onebun/core';

export interface GatewayInjectPayload {
  target: string;
  message: string;
  metadata?: {
    source: 'nats';
    eventId: string;
    subject: string;
    priority: number;
  };
}

@Service()
export class GatewayClientService extends BaseService implements OnModuleInit, OnModuleDestroy {
  private ws: WebSocket | null = null;
  private connected = false;
  private reconnectAttempt = 0;
  private reconnectTimer: Timer | null = null;
  private requestId = 0;
  private readonly wsUrl: string;
  private readonly token: string;

  constructor() {
    super();
    this.wsUrl = this.config.get('gateway.wsUrl');
    this.token = this.config.get('gateway.token');
  }

  async onModuleInit(): Promise<void> {
    if (this.wsUrl) {
      this.connect();
    }
  }

  private connect(): void {
    try {
      const url = this.token ? `${this.wsUrl}?token=${this.token}` : this.wsUrl;
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.logger.info('Gateway WebSocket connected');
        this.reconnectAttempt = 0;
        this.sendConnect();
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event);
      };

      this.ws.onclose = () => {
        this.connected = false;
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        this.logger.warn('Gateway WebSocket error');
        this.connected = false;
      };
    } catch {
      this.logger.warn('Failed to connect to Gateway WebSocket');
      this.scheduleReconnect();
    }
  }

  private handleMessage(event: { data: unknown }): void {
    try {
      const frame = JSON.parse(String(event.data));
      if (frame.type === 'res' && frame.ok) {
        this.connected = true;
      }
    } catch {
      // ignore parse errors
    }
  }

  private sendConnect(): void {
    this.send({
      type: 'req',
      id: ++this.requestId,
      method: 'connect',
      params: {},
    });
  }

  private send(frame: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(frame));
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempt), 30000);
    this.reconnectAttempt++;
    this.logger.debug(`Reconnecting to Gateway in ${delay}ms (attempt ${this.reconnectAttempt})`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  async inject(payload: GatewayInjectPayload): Promise<void> {
    if (!this.isAlive()) {
      throw new Error('Gateway WebSocket not connected');
    }
    this.send({
      type: 'req',
      id: ++this.requestId,
      method: 'send',
      params: {
        target: payload.target,
        message: payload.message,
        metadata: payload.metadata,
        idempotencyKey: payload.metadata?.eventId ?? String(this.requestId),
      },
    });
  }

  isAlive(): boolean {
    return this.connected && this.ws?.readyState === WebSocket.OPEN;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }
}
