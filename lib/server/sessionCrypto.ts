import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

function keyFromSecret(secret: string): Buffer {
  if (secret.length < 32) {
    throw new Error('PG_SESSION_SECRET must contain at least 32 characters');
  }
  return createHash('sha256').update(secret, 'utf8').digest();
}

export function seal(value: unknown, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFromSecret(secret), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), 'utf8'),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString('base64url')).join('.');
}

export function unseal<T>(cookie: string | undefined, secret: string): T | null {
  if (!cookie) return null;
  const parts = cookie.split('.');
  if (parts.length !== 3) return null;
  try {
    const [iv, tag, ciphertext] = parts.map((part) => Buffer.from(part, 'base64url'));
    if (iv.length !== 12 || tag.length !== 16) return null;
    const decipher = createDecipheriv('aes-256-gcm', keyFromSecret(secret), iv);
    decipher.setAuthTag(tag);
    const value = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function createPkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier, 'utf8').digest('base64url');
}
