import type { PgSession } from './authSession';
import { NextResponse } from 'next/server';
import { currentSession, setSessionCookies } from './authCookies';
import { crossSiteRejection, isCrossSiteWrite } from './requestOrigin';

export function backendBaseUrl(): string {
  const value = process.env.PG_API_BASE_URL || process.env.API_PROXY_TARGET || process.env.RESEARCH_API_BASE_URL;
  if (!value || !/^https?:\/\//.test(value)) {
    throw new Error('PG_API_BASE_URL must be an absolute backend URL');
  }
  return value.replace(/\/$/, '');
}

export async function forwardAuthenticated(
  request: Request,
  path: string,
  session: (PgSession & { accessExpired: boolean }) | null,
  options: { backendBase: string; researchKey?: string },
): Promise<Response> {
  if (isCrossSiteWrite(request)) return crossSiteRejection();
  if (!session || session.accessExpired) {
    return Response.json({ error: 'Sign-in required' }, { status: 401 });
  }
  if (!/^\/(chat|documents|app)(\/|$)/.test(path) || path.includes('..')) {
    return Response.json({ error: 'Unsupported API path' }, { status: 404 });
  }
  const headers: Record<string, string> = { Authorization: session.accessToken };
  const contentType = request.headers.get('content-type');
  if (contentType) headers['Content-Type'] = contentType;
  const accept = request.headers.get('accept');
  if (accept) headers.Accept = accept;
  if (options.researchKey) headers['x-api-key'] = options.researchKey;

  const upstream = await fetch(`${options.backendBase.replace(/\/$/, '')}${path}`, {
    method: request.method,
    headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.arrayBuffer(),
    cache: 'no-store',
    redirect: 'manual',
  });
  return new Response(upstream.body, { status: upstream.status, headers: safeResponseHeaders(upstream.headers) });
}

// Backend responses are served from the app origin, beside the session cookies,
// so nothing relayed may render as active content there.
const inlineTypes = ['application/json', 'text/plain'];
const downloadTypes = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/octet-stream',
];

function safeResponseHeaders(upstream: Headers): Headers {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "sandbox; default-src 'none'",
  });
  const location = upstream.get('location');
  if (location) headers.set('location', location);

  const contentType = upstream.get('content-type');
  if (!contentType) return headers;
  const mediaType = contentType.split(';')[0].trim().toLowerCase();
  if (inlineTypes.includes(mediaType)) {
    headers.set('content-type', contentType);
    return headers;
  }
  const disposition = upstream.get('content-disposition');
  headers.set('content-type', downloadTypes.includes(mediaType) ? contentType : 'application/octet-stream');
  headers.set('content-disposition', disposition ? disposition.replace(/^\s*inline\b/i, 'attachment') : 'attachment');
  if (!/^\s*attachment\b/i.test(headers.get('content-disposition')!)) {
    headers.set('content-disposition', `attachment; ${headers.get('content-disposition')}`);
  }
  return headers;
}

export async function authenticatedBackendResponse(request: Request, path: string): Promise<Response> {
  const current = await currentSession();
  if (!current) return Response.json({ error: 'Sign-in required' }, { status: 401 });
  const researchKey = path.startsWith('/chat/research') ? process.env.RAG_RESEARCH_API_KEY : undefined;
  try {
    const result = await forwardAuthenticated(request, path, {
      ...current.session, accessExpired: false,
    }, { backendBase: backendBaseUrl(), researchKey });
    if (!current.refreshed) return result;
    const response = new NextResponse(result.body, { status: result.status, headers: result.headers });
    setSessionCookies(response, current.session);
    return response;
  } catch {
    return Response.json({ error: 'Backend unavailable' }, { status: 502 });
  }
}
