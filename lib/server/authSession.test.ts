import { describe, expect, it } from 'vitest';
import { decodeSession, encodeSession } from './authSession';

const secret = 'pg-test-session-secret-with-at-least-32-characters';

describe('PG server session', () => {
  it('keeps identity and access credentials in separate sealed cookies', () => {
    const cookies = encodeSession({
      identity: { sub: 'u1', email: 'lawyer@example.com', role: 'regular_user' },
      accessToken: 'jwt-access', refreshToken: 'opaque-refresh', expiresAt: 2_000,
    }, secret);

    expect(decodeSession(cookies, secret, 1_500)).toEqual({
      identity: { sub: 'u1', email: 'lawyer@example.com', role: 'regular_user' },
      accessToken: 'jwt-access', refreshToken: 'opaque-refresh', expiresAt: 2_000,
      accessExpired: false,
    });
    expect(Object.values(cookies).join('')).not.toContain('opaque-refresh');
  });

  it('marks expired access tokens for server-side refresh', () => {
    const cookies = encodeSession({
      identity: { sub: 'u1', email: 'lawyer@example.com', role: 'admin' },
      accessToken: 'jwt-access', refreshToken: 'opaque-refresh', expiresAt: 2_000,
    }, secret);

    expect(decodeSession(cookies, secret, 2_001)?.accessExpired).toBe(true);
  });

  it('rejects missing refresh credentials', () => {
    const cookies = encodeSession({
      identity: { sub: 'u1', email: 'lawyer@example.com', role: 'admin' },
      accessToken: 'jwt-access', refreshToken: 'opaque-refresh', expiresAt: 2_000,
    }, secret);
    delete cookies.pg_refresh;

    expect(decodeSession(cookies, secret, 1_000)).toBeNull();
  });
});
