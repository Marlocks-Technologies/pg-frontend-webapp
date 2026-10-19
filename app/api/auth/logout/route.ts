import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { clearSessionCookies, readSession } from '@/lib/server/authCookies';
import { cognitoConfig, revokeRefreshToken } from '@/lib/server/cognito';
import { backendBaseUrl } from '@/lib/server/backendProxy';
import { crossSiteRejection, isCrossSiteWrite } from '@/lib/server/requestOrigin';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  if (isCrossSiteWrite(request)) return crossSiteRejection();
  const config = cognitoConfig();
  const session = await readSession();
  const appSessionId = (await cookies()).get('pg_app_session')?.value;
  if (session) {
    if (appSessionId && !session.accessExpired) {
      try {
        await fetch(`${backendBaseUrl()}/app/session/end`, {
          method: 'POST',
          headers: { Authorization: session.accessToken, 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: appSessionId }), cache: 'no-store',
        });
      } catch { /* last heartbeat still ages out */ }
    }
    try { await revokeRefreshToken(config, session.refreshToken); } catch { /* clear local session */ }
  }
  const logout = new URL(`${config.domain.replace(/\/$/, '')}/logout`);
  logout.searchParams.set('client_id', config.clientId);
  logout.searchParams.set('logout_uri', `${config.appUrl}/sign-in`);
  const response = NextResponse.redirect(logout.toString(), { status: 303 });
  clearSessionCookies(response);
  response.cookies.delete('pg_app_session');
  return response;
}
