/**
 * Server-only helpers for the legal-research proxy routes.
 *
 * POST /chat/research and GET /chat/research/{jobId} sit behind an API-key
 * usage plan because each job spends money on AgentCore web search. The key
 * therefore lives in a server-only env var and is attached here — never in a
 * NEXT_PUBLIC_* value, which would ship it to every browser.
 */

const DEFAULT_BACKEND = 'https://r17l0a5vbi.execute-api.eu-west-1.amazonaws.com/prod';

export function researchBackendUrl(path: string): string {
  const base = (
    process.env.RESEARCH_API_BASE_URL ||
    process.env.API_PROXY_TARGET ||
    DEFAULT_BACKEND
  ).replace(/\/+$/, '');
  return `${base}${path}`;
}

export function researchApiKey(): string | undefined {
  return process.env.RESEARCH_API_KEY;
}

export function missingKeyResponse(): Response {
  return Response.json(
    {
      error:
        'Legal research is not configured for this deployment. Set RESEARCH_API_KEY ' +
        'in the server environment.',
    },
    { status: 503 }
  );
}

/** Pass the backend's status and body straight through to the caller. */
export async function relay(upstream: Response): Promise<Response> {
  const body = await upstream.text();
  return new Response(body, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

export function upstreamUnreachable(error: unknown): Response {
  return Response.json(
    {
      error:
        error instanceof Error
          ? `Could not reach the research service: ${error.message}`
          : 'Could not reach the research service.',
    },
    { status: 502 }
  );
}
