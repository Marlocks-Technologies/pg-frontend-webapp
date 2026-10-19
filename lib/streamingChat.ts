// Real token streaming over the deployed API Gateway WebSocket.
//
// The browser connects directly to the WebSocket endpoint (the Next.js
// /api/backend rewrite is HTTP-only), sends a single `chat` action, and
// receives chat.start → chat.chunk* → chat.citations → chat.complete. Tokens
// are delivered to onChunk as they arrive so the UI can render progressively
// instead of waiting for the whole answer.

export interface StreamChatPayload {
  question: string;
  sessionId: string;
  topK?: number;
  useHistory?: boolean;
  filters?: Record<string, string>;
}

export interface StreamChatHandlers {
  onChunk: (text: string) => void;
  onCitations?: (citations: unknown[]) => void;
}

export interface StreamChatResult {
  answer: string;
  citations: unknown[];
}

interface StreamChatOptions {
  /** Override the endpoint; defaults to NEXT_PUBLIC_WEBSOCKET_URL. `null` disables. */
  url?: string | null;
  /** Injectable WebSocket implementation for tests. */
  WebSocketImpl?: typeof WebSocket;
  fetchImpl?: typeof fetch;
}

/** The configured WebSocket endpoint, or null when streaming is not enabled. */
export function streamingChatUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_WEBSOCKET_URL;
  return url && url.length > 0 ? url : null;
}

/** True when real streaming is available in this environment. */
export function isStreamingEnabled(): boolean {
  return streamingChatUrl() !== null && typeof WebSocket !== 'undefined';
}

export async function streamChatQuery(
  payload: StreamChatPayload,
  handlers: StreamChatHandlers,
  options?: StreamChatOptions,
): Promise<StreamChatResult> {
  const url = options?.url !== undefined ? options.url : streamingChatUrl();
  const WS =
    options?.WebSocketImpl ??
    (typeof WebSocket !== 'undefined' ? WebSocket : undefined);

  if (!url) throw new Error('streaming disabled: NEXT_PUBLIC_WEBSOCKET_URL is not set');
  if (!WS) throw new Error('WebSocket is not available in this environment');
  const ticketResponse = await (options?.fetchImpl ?? fetch)('/api/backend/app/ws-ticket', {
    method: 'POST', cache: 'no-store',
  });
  if (!ticketResponse.ok) throw new Error('Could not authorize streaming connection');
  const { ticket } = await ticketResponse.json() as { ticket?: string };
  if (!ticket) throw new Error('Missing streaming ticket');
  const ticketedUrl = new URL(url);
  ticketedUrl.searchParams.set('ticket', ticket);

  return new Promise<StreamChatResult>((resolve, reject) => {
    if (!url) {
      reject(new Error('streaming disabled: NEXT_PUBLIC_WEBSOCKET_URL is not set'));
      return;
    }
    if (!WS) {
      reject(new Error('WebSocket is not available in this environment'));
      return;
    }

    let answer = '';
    let citations: unknown[] = [];
    let settled = false;

    let ws: WebSocket;
    try {
      ws = new WS(ticketedUrl.toString());
    } catch (err) {
      reject(err instanceof Error ? err : new Error('failed to open websocket'));
      return;
    }

    const settle = (action: () => void) => {
      if (settled) return;
      settled = true;
      try {
        ws.close();
      } catch {
        // ignore
      }
      action();
    };

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          action: 'chat',
          question: payload.question,
          sessionId: payload.sessionId,
          ...(payload.topK !== undefined ? { topK: payload.topK } : {}),
          ...(payload.useHistory !== undefined ? { useHistory: payload.useHistory } : {}),
          ...(payload.filters !== undefined ? { filters: payload.filters } : {}),
        }),
      );
    };

    ws.onmessage = (ev: MessageEvent) => {
      let msg: { type?: string; content?: unknown; citations?: unknown[]; message?: unknown };
      try {
        msg = JSON.parse(typeof ev.data === 'string' ? ev.data : '');
      } catch {
        return;
      }
      switch (msg.type) {
        case 'chat.chunk':
          if (typeof msg.content === 'string') {
            answer += msg.content;
            handlers.onChunk(msg.content);
          }
          break;
        case 'chat.citations':
          citations = Array.isArray(msg.citations) ? msg.citations : [];
          handlers.onCitations?.(citations);
          break;
        case 'chat.complete':
          settle(() => resolve({ answer, citations }));
          break;
        case 'error':
          settle(() =>
            reject(new Error(typeof msg.message === 'string' ? msg.message : 'streaming error')),
          );
          break;
        default:
          break;
      }
    };

    ws.onerror = () => settle(() => reject(new Error('websocket error')));
    ws.onclose = () => settle(() => reject(new Error('websocket closed before completion')));
  });
}
