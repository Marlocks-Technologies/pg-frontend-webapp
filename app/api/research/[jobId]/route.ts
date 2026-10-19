import { authenticatedBackendResponse } from '@/lib/server/backendProxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/research/{jobId} → GET {backend}/chat/research/{jobId} */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
): Promise<Response> {
  const { jobId } = await params;
  if (!jobId) {
    return Response.json({ error: 'Missing job id.' }, { status: 400 });
  }

  return authenticatedBackendResponse(request, `/chat/research/${encodeURIComponent(jobId)}`);
}
