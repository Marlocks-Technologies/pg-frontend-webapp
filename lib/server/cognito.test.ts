import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSign, generateKeyPairSync } from 'node:crypto';
import { authorizationUrl, verifyCognitoJwt, type CognitoConfig } from './cognito';

const config: CognitoConfig = {
  domain: 'https://pg.auth.eu-west-1.amazoncognito.com',
  issuer: 'https://cognito-idp.eu-west-1.amazonaws.com/eu-west-1_pool',
  clientId: 'pg-client',
  clientSecret: 'secret',
  appUrl: 'https://pg.example.com',
  sessionSecret: 'test-session-secret-with-at-least-32-characters',
};

afterEach(() => vi.unstubAllGlobals());

describe('Cognito OAuth', () => {
  it('starts a code flow with PKCE, state, and nonce', () => {
    const url = new URL(authorizationUrl(config, {
      state: 'random-state', nonce: 'random-nonce', challenge: 's256-challenge',
    }));

    expect(url.pathname).toBe('/oauth2/authorize');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBe('s256-challenge');
    expect(url.searchParams.get('state')).toBe('random-state');
    expect(url.searchParams.get('nonce')).toBe('random-nonce');
    expect(url.searchParams.get('redirect_uri')).toBe('https://pg.example.com/api/auth/callback');
  });

  it('rejects a correctly signed token for the wrong client', async () => {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const jwk = publicKey.export({ format: 'jwk' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ keys: [{ ...jwk, kid: 'key-1', alg: 'RS256', use: 'sig' }] }),
    }));
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'key-1' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
      iss: config.issuer, aud: 'other-client', token_use: 'id', sub: 'user-1',
      exp: Math.floor(Date.now() / 1000) + 300, nonce: 'nonce-1',
    })).toString('base64url');
    const signingInput = `${header}.${payload}`;
    const signature = createSign('RSA-SHA256').update(signingInput).end().sign(privateKey).toString('base64url');

    await expect(verifyCognitoJwt(`${signingInput}.${signature}`, config, 'id', 'nonce-1'))
      .rejects.toThrow(/client/i);
  });
});
