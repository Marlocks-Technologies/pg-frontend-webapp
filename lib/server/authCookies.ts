import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { decodeSession, encodeSession, type PgSession } from './authSession';
import { cognitoConfig, refreshTokens, verifyCognitoJwt } from './cognito';

const names = ['pg_identity', 'pg_access', 'pg_refresh'] as const;
const maxAge = 24 * 60 * 60;

export function setSessionCookies(response: NextResponse, session: PgSession): void {
  const encoded = encodeSession(session, cognitoConfig().sessionSecret);
  for (const name of names) {
    response.cookies.set(name, encoded[name]!, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge,
    });
  }
}

export function clearSessionCookies(response: NextResponse): void {
  for (const name of names) response.cookies.delete(name);
}

export async function readSession(): Promise<(PgSession & { accessExpired: boolean }) | null> {
  const jar = await cookies();
  return decodeSession({
    pg_identity: jar.get('pg_identity')?.value,
    pg_access: jar.get('pg_access')?.value,
    pg_refresh: jar.get('pg_refresh')?.value,
  }, cognitoConfig().sessionSecret);
}

export async function currentSession(): Promise<{ session: PgSession; refreshed: boolean } | null> {
  const session = await readSession();
  if (!session) return null;
  if (!session.accessExpired) return { session, refreshed: false };
  try {
    const config = cognitoConfig();
    const tokens = await refreshTokens(config, session.refreshToken);
    const claims = await verifyCognitoJwt(tokens.access_token, config, 'access');
    if (claims.sub !== session.identity.sub) return null;
    return {
      session: {
        identity: session.identity,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || session.refreshToken,
        expiresAt: Math.floor(Date.now() / 1000) + tokens.expires_in,
      },
      refreshed: true,
    };
  } catch {
    return null;
  }
}
