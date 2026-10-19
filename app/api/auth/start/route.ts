import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { authorizationUrl, cognitoConfig } from '@/lib/server/cognito';
import { createPkceChallenge, seal } from '@/lib/server/sessionCrypto';

export const runtime = 'nodejs';

export async function GET(): Promise<NextResponse> {
  const config = cognitoConfig();
  const state = randomBytes(24).toString('base64url');
  const nonce = randomBytes(24).toString('base64url');
  const verifier = randomBytes(48).toString('base64url');
  const response = NextResponse.redirect(authorizationUrl(config, {
    state, nonce, challenge: createPkceChallenge(verifier),
  }));
  response.cookies.set('pg_oauth_flow', seal({ state, nonce, verifier }, config.sessionSecret), {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 600,
  });
  return response;
}
