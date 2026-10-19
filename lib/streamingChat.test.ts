import { describe, it, expect } from 'vitest';
import { streamChatQuery } from './streamingChat';

class FakeWebSocket {
  static last: FakeWebSocket | null = null;
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  sent: string[] = [];
  closed = false;

  constructor(public url: string) {
    FakeWebSocket.last = this;
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.closed = true;
  }

  // test drivers
  open() {
    this.onopen?.();
  }
  message(obj: unknown) {
    this.onmessage?.({ data: JSON.stringify(obj) });
  }
  error() {
    this.onerror?.();
  }
}

const URL = 'wss://example.test/prod';
const fetchTicket = (async () => Response.json({ ticket: 'one-use-ticket' })) as typeof fetch;

describe('streamChatQuery', () => {
  it('sends a chat action and resolves with the accumulated answer and citations', async () => {
    const chunks: string[] = [];
    const promise = streamChatQuery(
      { question: 'What is a contract?', sessionId: 's1', useHistory: true },
      { onChunk: (t) => chunks.push(t) },
      { url: URL, WebSocketImpl: FakeWebSocket as unknown as typeof WebSocket, fetchImpl: fetchTicket },
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    const ws = FakeWebSocket.last!;
    expect(ws.url).toContain('ticket=one-use-ticket');
    ws.open();
    expect(JSON.parse(ws.sent[0])).toEqual({
      action: 'chat',
      question: 'What is a contract?',
      sessionId: 's1',
      useHistory: true,
    });

    ws.message({ type: 'chat.start' });
    ws.message({ type: 'chat.chunk', content: 'A contract ' });
    ws.message({ type: 'chat.chunk', content: 'is an agreement.' });
    ws.message({ type: 'chat.citations', citations: [{ source: 1 }] });
    ws.message({ type: 'chat.complete' });

    const result = await promise;
    expect(chunks).toEqual(['A contract ', 'is an agreement.']);
    expect(result.answer).toBe('A contract is an agreement.');
    expect(result.citations).toEqual([{ source: 1 }]);
    expect(ws.closed).toBe(true);
  });

  it('rejects when the server sends an error message', async () => {
    const promise = streamChatQuery(
      { question: 'Q', sessionId: 's1' },
      { onChunk: () => {} },
      { url: URL, WebSocketImpl: FakeWebSocket as unknown as typeof WebSocket, fetchImpl: fetchTicket },
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    const ws = FakeWebSocket.last!;
    ws.open();
    ws.message({ type: 'error', message: 'boom' });

    await expect(promise).rejects.toThrow('boom');
  });

  it('rejects immediately when no websocket url is configured', async () => {
    await expect(
      streamChatQuery(
        { question: 'Q', sessionId: 's1' },
        { onChunk: () => {} },
        { url: null, WebSocketImpl: FakeWebSocket as unknown as typeof WebSocket },
      ),
    ).rejects.toThrow(/not set|disabled/i);
  });
});
