import { cookies } from 'next/headers';
import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { backendBaseUrl } from '@/lib/server/backendProxy';
import { clearSessionCookies, setSessionCookies } from '@/lib/server/authCookies';
import { cognitoConfig, exchangeCode, verifyCognitoJwt } from '@/lib/server/cognito';
import { unseal } from '@/lib/server/sessionCrypto';
import type { PgIdentity, PgRole } from '@/lib/server/authSession';

export const runtime = 'nodejs';

type Flow = { state: string; nonce: string; verifier: string };
const roles = new Set<PgRole>(['admin', 'document_manager', 'regular_user']);

export async function GET(request: Request): Promise<NextResponse> {
  const config = cognitoConfig();
  const failure = (reason: string) => {
    const response = NextResponse.redirect(`${config.appUrl}/sign-in?error=${reason}`);
    response.cookies.delete('pg_oauth_flow');
    clearSessionCookies(response);
    return response;
  };
  const url = new URL(request.url);
  const jar = await cookies();
  const flow = unseal<Flow>(jar.get('pg_oauth_flow')?.value, config.sessionSecret);
  if (url.searchParams.has('error') || !flow?.state || !flow.verifier || !flow.nonce ||
      url.searchParams.get('state') !== flow.state || !url.searchParams.get('code')) {
    return failure('authorization');
  }
  try {
    const tokens = await exchangeCode(config, url.searchParams.get('code')!, flow.verifier);
    if (!tokens.id_token || !tokens.refresh_token) return failure('tokens');
    const [id, access] = await Promise.all([
      verifyCognitoJwt(tokens.id_token, config, 'id', flow.nonce),
      verifyCognitoJwt(tokens.access_token, config, 'access'),
    ]);
    if (id.sub !== access.sub) return failure('identity');
    const account = await fetch(`${backendBaseUrl()}/app/me`, {
      headers: { Authorization: tokens.access_token }, cache: 'no-store',
    });
    if (!account.ok) return failure('account');
    const identity = await account.json() as PgIdentity;
    if (identity.sub !== id.sub || identity.email !== id.email || !roles.has(identity.role)) {
      return failure('account');
    }
    const appSessionId = randomUUID();
    const started = await fetch(`${backendBaseUrl()}/app/session/start`, {
      method: 'POST',
      headers: { Authorization: tokens.access_token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: appSessionId }), cache: 'no-store',
    });
    if (!started.ok) return failure('session');
    const response = NextResponse.redirect(`${config.appUrl}/chat`);
    response.cookies.delete('pg_oauth_flow');
    setSessionCookies(response, {
      identity,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Math.floor(Date.now() / 1000) + tokens.expires_in,
    });
    response.cookies.set('pg_app_session', appSessionId, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 86400,
    });
    return response;
  } catch {
    return failure('authorization');
  }
}
