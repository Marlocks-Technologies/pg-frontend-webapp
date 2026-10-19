import { authenticatedBackendResponse } from '@/lib/server/backendProxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/research → POST {backend}/chat/research */
export async function POST(request: Request): Promise<Response> {
  return authenticatedBackendResponse(request, '/chat/research');
}
