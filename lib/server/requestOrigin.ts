const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * True when a state-changing request was sent by another site. Browsers attach
 * Origin and Sec-Fetch-Site to writes; a request without either did not come
 * from a page that could ride the user's cookies.
 */
export function isCrossSiteWrite(request: Request, appUrl = process.env.PG_APP_URL): boolean {
  if (safeMethods.has(request.method.toUpperCase())) return false;
  const origin = request.headers.get('origin');
  if (origin) {
    const allowed = new Set([new URL(request.url).origin]);
    if (appUrl) {
      try { allowed.add(new URL(appUrl).origin); } catch { /* ignore malformed config */ }
    }
    return !allowed.has(origin);
  }
  const fetchSite = request.headers.get('sec-fetch-site');
  return fetchSite !== null && fetchSite !== 'same-origin' && fetchSite !== 'none';
}

export function crossSiteRejection(): Response {
  return Response.json({ error: 'Cross-site request refused' }, { status: 403 });
}
