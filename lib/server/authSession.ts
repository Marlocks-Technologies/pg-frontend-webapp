import { seal, unseal } from './sessionCrypto';

export type PgRole = 'admin' | 'document_manager' | 'regular_user';

export interface PgIdentity {
  sub: string;
  email: string;
  role: PgRole;
}

export interface PgSession {
  identity: PgIdentity;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export type CookieBag = {
  pg_identity?: string;
  pg_access?: string;
  pg_refresh?: string;
};

export function encodeSession(session: PgSession, secret: string): CookieBag {
  return {
    pg_identity: seal(session.identity, secret),
    pg_access: seal({ token: session.accessToken, expiresAt: session.expiresAt }, secret),
    pg_refresh: seal({ token: session.refreshToken }, secret),
  };
}

export function decodeSession(
  cookies: CookieBag,
  secret: string,
  now = Math.floor(Date.now() / 1000),
): (PgSession & { accessExpired: boolean }) | null {
  const identity = unseal<PgIdentity>(cookies.pg_identity, secret);
  const access = unseal<{ token: string; expiresAt: number }>(cookies.pg_access, secret);
  const refresh = unseal<{ token: string }>(cookies.pg_refresh, secret);
  if (!identity?.sub || !identity.email || !identity.role ||
      !access?.token || !Number.isFinite(access.expiresAt) || !refresh?.token) return null;
  return {
    identity,
    accessToken: access.token,
    refreshToken: refresh.token,
    expiresAt: access.expiresAt,
    accessExpired: access.expiresAt <= now + 30,
  };
}
