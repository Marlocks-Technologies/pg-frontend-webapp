import { createPublicKey, createVerify } from 'node:crypto';

export interface CognitoConfig {
  domain: string;
  issuer: string;
  clientId: string;
  clientSecret: string;
  appUrl: string;
  sessionSecret: string;
}

export interface CognitoTokens {
  access_token: string;
  id_token?: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

export function cognitoConfig(): CognitoConfig {
  const values = {
    domain: process.env.COGNITO_DOMAIN,
    issuer: process.env.COGNITO_ISSUER,
    clientId: process.env.COGNITO_CLIENT_ID,
    clientSecret: process.env.COGNITO_CLIENT_SECRET,
    appUrl: process.env.PG_APP_URL,
    sessionSecret: process.env.PG_SESSION_SECRET,
  };
  for (const [key, value] of Object.entries(values)) {
    if (!value) throw new Error(`Missing PG authentication setting: ${key}`);
  }
  return values as CognitoConfig;
}

export function authorizationUrl(
  config: CognitoConfig,
  flow: { state: string; nonce: string; challenge: string },
): string {
  const url = new URL(`${config.domain.replace(/\/$/, '')}/oauth2/authorize`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', `${config.appUrl}/api/auth/callback`);
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', flow.state);
  url.searchParams.set('nonce', flow.nonce);
  url.searchParams.set('code_challenge', flow.challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

function tokenEndpointHeaders(config: CognitoConfig): HeadersInit {
  const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
  return {
    'Content-Type': 'application/x-www-form-urlencoded',
    Authorization: `Basic ${credentials}`,
  };
}

async function tokenRequest(config: CognitoConfig, body: URLSearchParams): Promise<CognitoTokens> {
  const response = await fetch(`${config.domain.replace(/\/$/, '')}/oauth2/token`, {
    method: 'POST',
    headers: tokenEndpointHeaders(config),
    body,
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Cognito token exchange failed');
  const tokens = await response.json() as CognitoTokens;
  if (!tokens.access_token || !tokens.expires_in) throw new Error('Cognito returned incomplete tokens');
  return tokens;
}

export function exchangeCode(config: CognitoConfig, code: string, verifier: string): Promise<CognitoTokens> {
  return tokenRequest(config, new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: config.clientId,
    code,
    code_verifier: verifier,
    redirect_uri: `${config.appUrl}/api/auth/callback`,
  }));
}

export function refreshTokens(config: CognitoConfig, refreshToken: string): Promise<CognitoTokens> {
  return tokenRequest(config, new URLSearchParams({
    grant_type: 'refresh_token', client_id: config.clientId, refresh_token: refreshToken,
  }));
}

export async function revokeRefreshToken(config: CognitoConfig, refreshToken: string): Promise<void> {
  await fetch(`${config.domain.replace(/\/$/, '')}/oauth2/revoke`, {
    method: 'POST',
    headers: tokenEndpointHeaders(config),
    body: new URLSearchParams({ token: refreshToken, client_id: config.clientId }),
    cache: 'no-store',
  });
}

type TokenUse = 'id' | 'access';

export async function verifyCognitoJwt(
  token: string,
  config: CognitoConfig,
  tokenUse: TokenUse,
  nonce?: string,
): Promise<Record<string, unknown>> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Malformed Cognito token');
  let header: { alg?: string; kid?: string };
  let claims: Record<string, unknown>;
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    throw new Error('Malformed Cognito token');
  }
  if (header.alg !== 'RS256' || !header.kid) throw new Error('Unexpected Cognito signing algorithm');
  const keysResponse = await fetch(`${config.issuer}/.well-known/jwks.json`, { cache: 'force-cache' });
  if (!keysResponse.ok) throw new Error('Cognito signing keys unavailable');
  const { keys } = await keysResponse.json() as { keys: Array<JsonWebKey & { kid?: string }> };
  const jwk = keys.find((key) => key.kid === header.kid);
  if (!jwk) throw new Error('Cognito signing key not found');
  const verifier = createVerify('RSA-SHA256');
  verifier.update(`${parts[0]}.${parts[1]}`);
  verifier.end();
  if (!verifier.verify(createPublicKey({ key: jwk as unknown as import('node:crypto').JsonWebKey, format: 'jwk' }), Buffer.from(parts[2], 'base64url'))) {
    throw new Error('Invalid Cognito token signature');
  }
  const now = Math.floor(Date.now() / 1000);
  if (claims.iss !== config.issuer || claims.token_use !== tokenUse ||
      typeof claims.exp !== 'number' || claims.exp <= now ||
      typeof claims.sub !== 'string' || !claims.sub) {
    throw new Error('Invalid Cognito token claims');
  }
  if (tokenUse === 'id' && claims.aud !== config.clientId) throw new Error('Wrong Cognito client');
  if (tokenUse === 'access' && claims.client_id !== config.clientId) throw new Error('Wrong Cognito client');
  if (nonce && claims.nonce !== nonce) throw new Error('Cognito nonce mismatch');
  return claims;
}
