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

interface PendingRequest {
  resolve: () => void;
  reject: (err: Error) => void;
  timer: Timer;
}

const RPC_TIMEOUT_MS = 10_000;

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
  private pendingRequests = new Map<string, PendingRequest>();

  async onModuleInit(): Promise<void> {
    this.wsUrl = this.config.get('gateway.wsUrl');
    this.token = this.config.get('gateway.token');
    if (this.wsUrl && this.token) {
      this.connect();
    } else {
      this.logger.warn('Gateway WebSocket not configured — skipping connection (need wsUrl + deviceToken)');
    }
  }

  private connect(): void {
    try {
      this.connectSent = false;
      this.ws = new WebSocket(this.wsUrl);

      this.ws.onopen = () => {
        this.reconnectAttempt = 0;
        this.logger.info('Gateway WebSocket opened, waiting for connect.challenge');
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(String(event.data));
      };

      this.ws.onclose = () => {
        this.connected = false;
        this.connectSent = false;
        // Reject all in-flight requests immediately — don't make callers wait for timeout
        for (const [id, pending] of this.pendingRequests) {
          clearTimeout(pending.timer);
          pending.reject(new Error('Gateway WebSocket closed'));
        }
        this.pendingRequests.clear();
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

    // Successful connect response — must be hello-ok
    if (frame.type === 'res' && frame.ok === true) {
      const payload = frame.payload;
      if (payload?.type === 'hello-ok') {
        if (!this.connected) {
          this.connected = true;
          const grantedScopes = payload.auth?.scopes ?? [];
          const serverVersion = payload.server?.version ?? 'unknown';
          this.logger.info('OpenClaw handshake complete', {
            protocol: payload.protocol,
            serverVersion,
            grantedScopes,
            connId: payload.server?.connId,
          });
          if (grantedScopes.length > 0 && !grantedScopes.includes('operator.write')) {
            this.logger.error(
              `Gateway did NOT grant operator.write scope! Granted: [${grantedScopes.join(', ')}]. ` +
              'Message delivery will fail. Rotate the device token with --scope operator.write',
            );
          }
        }
        return;
      }
      // Regular RPC ok response (e.g. for inject calls)
      this.logger.debug('Received RPC ok response', { id: frame.id });
      this.resolvePending(frame.id);
      return;
    }

    // Error response
    if (frame.type === 'res' && frame.ok === false) {
      const errorCode = frame.error?.code ?? frame.error?.errorCode ?? 'UNKNOWN';
      const errorMessage = frame.error?.message ?? frame.error?.errorMessage ?? 'Unknown gateway error';
      this.logger.error('Gateway RPC error', { id: frame.id, errorCode, errorMessage });

      // If this is a connect error, close and reconnect
      if (frame.id?.startsWith('connect-')) {
        this.logger.error(`Gateway rejected connection: ${errorCode} — ${errorMessage}`);
        this.connected = false;
        this.connectSent = false;
        this.ws?.close();
        return;
      }

      this.rejectPending(frame.id, new GatewayRpcError(frame.id, String(errorCode), String(errorMessage)));
    }
  }

  private sendConnectFrame(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || this.connectSent) return;
    this.connectSent = true;
    this.logger.info('Sending connect frame');

    try {
      this.send({
      type: 'req',
      id: `connect-${++this.requestId}`,
      method: 'connect',
      params: {
        minProtocol: 3,
        maxProtocol: 3,
        client: {
          id: 'gateway-client',
          displayName: 'nats-sidecar',
          version: '1.0.0',
          platform: 'linux',
          mode: 'backend',
        },
        role: 'operator',
        scopes: ['operator.read', 'operator.write'],
        caps: [],
        commands: [],
        permissions: {},
        auth: { token: this.token },
        locale: 'en-US',
        userAgent: 'nats-sidecar/1.0.0',
      },
    });
    } catch (err) {
      this.logger.error('Failed to send connect frame', err);
      this.connectSent = false;
    }
  }

  private send(frame: unknown): void {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }
    try {
      this.ws.send(JSON.stringify(frame));
    } catch (err) {
      this.connected = false;
      throw new Error(`WebSocket send failed: ${err instanceof Error ? err.message : String(err)}`);
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
    const id = `rpc-${++this.requestId}`;
    const promise = this.trackRequest(id);
    this.send({
      type: 'req',
      id,
      method: 'send',
      params: {
        target: payload.target,
        message: payload.message,
        metadata: payload.metadata,
        idempotencyKey: payload.metadata?.eventId ?? String(this.requestId),
      },
    });
    return promise;
  }

  private trackRequest(id: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Gateway RPC timeout after ${RPC_TIMEOUT_MS}ms [${id}]`));
      }, RPC_TIMEOUT_MS);
      this.pendingRequests.set(id, { resolve, reject, timer });
    });
  }

  private resolvePending(id: string): void {
    const pending = this.pendingRequests.get(id);
    if (pending) {
      clearTimeout(pending.timer);
      this.pendingRequests.delete(id);
      pending.resolve();
    }
  }

  private rejectPending(id: string, err: Error): void {
    const pending = this.pendingRequests.get(id);
    if (pending) {
      clearTimeout(pending.timer);
      this.pendingRequests.delete(id);
      pending.reject(err);
    }
  }

  isAlive(): boolean {
    return this.connected && this.ws?.readyState === WebSocket.OPEN;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Gateway client shutting down'));
    }
    this.pendingRequests.clear();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.connectSent = false;
  }
}
