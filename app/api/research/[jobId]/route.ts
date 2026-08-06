import {
  missingKeyResponse,
  relay,
  researchApiKey,
  researchBackendUrl,
  upstreamUnreachable,
} from '@/lib/researchProxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/research/{jobId} → GET {backend}/chat/research/{jobId} */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
): Promise<Response> {
  const apiKey = researchApiKey();
  if (!apiKey) return missingKeyResponse();

  const { jobId } = await params;
  if (!jobId) {
    return Response.json({ error: 'Missing job id.' }, { status: 400 });
  }

  try {
    const upstream = await fetch(
      researchBackendUrl(`/chat/research/${encodeURIComponent(jobId)}`),
      { headers: { 'x-api-key': apiKey }, cache: 'no-store' }
    );
    return relay(upstream);
  } catch (error) {
    return upstreamUnreachable(error);
  }
}
