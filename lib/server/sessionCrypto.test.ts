import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { createPkceChallenge, seal, unseal } from './sessionCrypto';

const SECRET = 'pg-test-session-secret-with-at-least-32-characters';

describe('session cookie protection', () => {
  it('round-trips an authenticated session without exposing the token in plaintext', () => {
    const cookie = seal({ sub: 'user-1', accessToken: 'sensitive-token' }, SECRET);

    expect(cookie).not.toContain('sensitive-token');
    expect(unseal(cookie, SECRET)).toEqual({ sub: 'user-1', accessToken: 'sensitive-token' });
  });

  it('rejects a modified cookie', () => {
    const cookie = seal({ sub: 'user-1' }, SECRET);
    const parts = cookie.split('.');
    parts[2] = `${parts[2].slice(0, -2)}xx`;

    expect(unseal(parts.join('.'), SECRET)).toBeNull();
  });

  it('uses the S256 PKCE challenge for the authorization code', () => {
    const verifier = 'known-code-verifier-123';
    const expected = createHash('sha256').update(verifier).digest('base64url');

    expect(createPkceChallenge(verifier)).toBe(expected);
  });
});
