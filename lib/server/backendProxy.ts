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
  const responseHeaders = new Headers({ 'Cache-Control': 'no-store' });
  for (const name of ['content-type', 'content-disposition', 'location']) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
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
