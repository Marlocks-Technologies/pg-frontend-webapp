import { researchApiKey } from '@/lib/researchProxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Reports only whether deep research is usable in this deployment, so the UI
 * can avoid offering a button that would 503. Returns a boolean and nothing
 * else — never the key or any part of it.
 */
export async function GET(): Promise<Response> {
  return Response.json(
    { configured: Boolean(researchApiKey()) },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
