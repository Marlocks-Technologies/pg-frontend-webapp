import {
  missingKeyResponse,
  relay,
  researchApiKey,
  researchBackendUrl,
  upstreamUnreachable,
} from '@/lib/researchProxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/research → POST {backend}/chat/research */
export async function POST(request: Request): Promise<Response> {
  const apiKey = researchApiKey();
  if (!apiKey) return missingKeyResponse();

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: 'Request body must be JSON.' }, { status: 400 });
  }

  try {
    const upstream = await fetch(researchBackendUrl('/chat/research'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
    return relay(upstream);
  } catch (error) {
    return upstreamUnreachable(error);
  }
}
