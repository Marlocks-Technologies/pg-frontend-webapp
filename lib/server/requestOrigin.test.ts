// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { isCrossSiteWrite } from './requestOrigin';

const url = 'https://pg.example.com/api/backend/documents';

describe('cross-site write guard', () => {
  it('allows reads regardless of origin', () => {
    expect(isCrossSiteWrite(new Request(url, { headers: { Origin: 'https://evil.example' } }))).toBe(false);
  });

  it('allows same-origin writes', () => {
    expect(isCrossSiteWrite(new Request(url, {
      method: 'POST', headers: { Origin: 'https://pg.example.com', 'Sec-Fetch-Site': 'same-origin' },
    }))).toBe(false);
  });

  it('rejects writes from another origin', () => {
    expect(isCrossSiteWrite(new Request(url, { method: 'POST', headers: { Origin: 'https://evil.example' } }))).toBe(true);
    expect(isCrossSiteWrite(new Request(url, { method: 'DELETE', headers: { 'Sec-Fetch-Site': 'cross-site' } }))).toBe(true);
  });

  it('rejects writes from a sibling subdomain', () => {
    expect(isCrossSiteWrite(new Request(url, {
      method: 'POST', headers: { Origin: 'https://other.example.com', 'Sec-Fetch-Site': 'same-site' },
    }))).toBe(true);
  });

  it('accepts the configured public app URL behind a proxy', () => {
    const internal = new Request('http://localhost:3000/api/backend/documents', {
      method: 'POST', headers: { Origin: 'https://pg.example.com' },
    });
    expect(isCrossSiteWrite(internal, 'https://pg.example.com/')).toBe(false);
  });
});
