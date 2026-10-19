import { authenticatedBackendResponse } from '@/lib/server/backendProxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handle(request: Request, context: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const { path } = await context.params;
  const targetPath = `/${path.map(encodeURIComponent).join('/')}${new URL(request.url).search}`;
  return authenticatedBackendResponse(request, targetPath);
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
