import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { currentSession, setSessionCookies } from '@/lib/server/authCookies';
import { backendBaseUrl } from '@/lib/server/backendProxy';
import { crossSiteRejection, isCrossSiteWrite } from '@/lib/server/requestOrigin';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  if (isCrossSiteWrite(request)) return crossSiteRejection();
  const current = await currentSession();
  const appSessionId = (await cookies()).get('pg_app_session')?.value;
  if (!current || !appSessionId) return Response.json({ error: 'Sign-in required' }, { status: 401 });
  try {
    const upstream = await fetch(`${backendBaseUrl()}/app/session/heartbeat`, {
      method: 'POST',
      headers: { Authorization: current.session.accessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: appSessionId }), cache: 'no-store',
    });
    const response = new NextResponse(upstream.body, { status: upstream.status, headers: { 'Cache-Control': 'no-store' } });
    if (current.refreshed) setSessionCookies(response, current.session);
    return response;
  } catch {
    return Response.json({ error: 'Backend unavailable' }, { status: 502 });
  }
}
