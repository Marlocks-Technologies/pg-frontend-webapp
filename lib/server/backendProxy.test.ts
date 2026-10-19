// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { forwardAuthenticated } from './backendProxy';
import type { PgSession } from './authSession';

const session: PgSession = {
  identity: { sub: 'u1', email: 'lawyer@example.com', role: 'regular_user' },
  accessToken: 'verified-access-token', refreshToken: 'refresh', expiresAt: 9999999999,
};

afterEach(() => vi.unstubAllGlobals());

describe('authenticated backend proxy', () => {
  it('refuses requests without an app session', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);

    const result = await forwardAuthenticated(new Request('https://pg.example.com/api/backend/documents'),
      '/documents', null, { backendBase: 'https://api.example.com/prod' });

    expect(result.status).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('forwards only the verified access token and server-side research key', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ jobId: 'job-1' }), { status: 202 }));
    vi.stubGlobal('fetch', fetcher);

    const result = await forwardAuthenticated(new Request('https://pg.example.com/api/research', {
      method: 'POST', body: JSON.stringify({ question: 'CAMA?' }),
      headers: { 'Content-Type': 'application/json' },
    }), '/chat/research', { ...session, accessExpired: false }, {
      backendBase: 'https://api.example.com/prod', researchKey: 'server-only-key',
    });

    expect(result.status).toBe(202);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('https://api.example.com/prod/chat/research');
    expect(init.headers.Authorization).toBe('verified-access-token');
    expect(init.headers['x-api-key']).toBe('server-only-key');
  });
});

describe('authenticated backend proxy origin check', () => {
  it('refuses cross-site writes before contacting the backend', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);

    const result = await forwardAuthenticated(new Request('https://pg.example.com/api/backend/documents/d1', {
      method: 'DELETE', headers: { Origin: 'https://evil.example' },
    }), '/documents/d1', { ...session, accessExpired: false }, { backendBase: 'https://api.example.com/prod' });

    expect(result.status).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('authenticated backend proxy response hardening', () => {
  const forward = (upstream: Response) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(upstream));
    return forwardAuthenticated(new Request('https://pg.example.com/api/backend/documents/d1'),
      '/documents/d1', { ...session, accessExpired: false }, { backendBase: 'https://api.example.com/prod' });
  };

  it('serves active content from the backend as an inert download', async () => {
    const result = await forward(new Response('<script>alert(1)</script>', {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }));

    expect(result.headers.get('content-type')).toBe('application/octet-stream');
    expect(result.headers.get('content-disposition')).toMatch(/^attachment/);
    expect(result.headers.get('x-content-type-options')).toBe('nosniff');
    expect(result.headers.get('content-security-policy')).toContain('sandbox');
  });

  it('keeps JSON and document types, forcing documents to download', async () => {
    const json = await forward(Response.json({ ok: true }));
    expect(json.headers.get('content-type')).toContain('application/json');
    expect(json.headers.get('content-disposition')).toBeNull();

    const pdf = await forward(new Response('%PDF', {
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="brief.pdf"' },
    }));
    expect(pdf.headers.get('content-type')).toBe('application/pdf');
    expect(pdf.headers.get('content-disposition')).toBe('attachment; filename="brief.pdf"');
  });
});
