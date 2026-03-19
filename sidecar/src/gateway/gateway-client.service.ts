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
  private connectSent = false;
  private reconnectAttempt = 0;
  private reconnectTimer: Timer | null = null;
  private requestId = 0;
  private wsUrl!: string;
  private token!: string;

  async onModuleInit(): Promise<void> {
    this.wsUrl = this.config.get('gateway.wsUrl');
    this.token = this.config.get('gateway.token');
    if (this.wsUrl) {
      this.connect();
    }
  }

  private connect(): void {
    try {
      this.connectSent = false;
      this.ws = new WebSocket(this.wsUrl);

      this.ws.onopen = () => {
        this.reconnectAttempt = 0;
        this.logger.info('Gateway WebSocket opened, waiting for challenge');
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(String(event.data));
      };

      this.ws.onclose = () => {
        this.connected = false;
        this.connectSent = false;
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        this.logger.warn('Gateway WebSocket error');
        this.connected = false;
      };
    } catch (err) {
      this.logger.warn('Failed to connect to Gateway WebSocket', err);
      this.scheduleReconnect();
    }
  }

  private handleMessage(data: string): void {
    let frame: any;
    try {
      frame = JSON.parse(data);
    } catch {
      this.logger.warn(`Failed to parse WebSocket message: ${data.slice(0, 200)}`);
      return;
    }

    // Server challenge — respond with connect frame
    if (frame.type === 'event' && frame.event === 'connect.challenge') {
      this.logger.debug('Received connect.challenge from server');
      this.sendConnectFrame();
      return;
    }

    // Some gateway versions send an event before challenge; treat any pre-connect event as trigger
    if (!this.connectSent && frame.type === 'event') {
      this.logger.debug('Received event before connect sent, sending connect frame');
      this.sendConnectFrame();
      return;
    }

    // Successful connect response (hello-ok)
    if (frame.type === 'res' && frame.ok === true) {
      if (frame.payload?.type === 'hello-ok') {
        this.connected = true;
        this.logger.info('OpenClaw handshake complete — connected');
        return;
      }
      // Regular RPC response — ignore for now
      return;
    }

    // Error response
    if (frame.type === 'res' && frame.ok === false) {
      this.logger.warn('Gateway RPC error', { id: frame.id, error: frame.error });
    }
  }

  private sendConnectFrame(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || this.connectSent) return;
    this.connectSent = true;
    this.logger.info('Sending connect frame');

    this.send({
      type: 'req',
      id: `connect-${++this.requestId}`,
      method: 'connect',
      params: {
        minProtocol: 3,
        maxProtocol: 3,
        client: {
          id: 'nats-sidecar',
          version: '1.0.0',
          platform: 'linux',
          mode: 'backend',
        },
        role: 'operator',
        scopes: ['operator.read'],
        caps: [],
        commands: [],
        permissions: {},
        auth: { token: this.token },
        locale: 'en-US',
        userAgent: 'nats-sidecar/1.0.0',
      },
    });
  }

  private send(frame: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(frame));
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempt), 30_000);
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
      id: `rpc-${++this.requestId}`,
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
    this.connectSent = false;
  }
}
