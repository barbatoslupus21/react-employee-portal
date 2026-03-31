import { NextRequest, NextResponse } from 'next/server';

/**
 * Proxy certificate media files from Django, stripping X-Frame-Options and
 * Content-Security-Policy frame-ancestors headers so they can be embedded in
 * an iframe on the same frontend origin.
 *
 * Usage: /api/cert-proxy?path=/media/certificates/file.pdf
 */
export async function GET(req: NextRequest) {
  const filePath = req.nextUrl.searchParams.get('path');
  if (!filePath) {
    return new NextResponse('Missing path parameter', { status: 400 });
  }

  // Only allow /media/ paths to prevent SSRF abuse.
  if (!filePath.startsWith('/media/')) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  const djangoBase = process.env.DJANGO_BASE_URL ?? 'http://localhost:8000';
  const upstream = `${djangoBase}${filePath}`;

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(upstream, { cache: 'no-store' });
  } catch {
    return new NextResponse('Failed to fetch file from backend', { status: 502 });
  }

  if (!upstreamRes.ok) {
    return new NextResponse(upstreamRes.statusText, { status: upstreamRes.status });
  }

  // Copy through headers, stripping those that block embedding or trigger downloads.
  const headers = new Headers();
  const blocked = new Set([
    'x-frame-options',
    'content-security-policy',
    'content-disposition',  // we set our own below
  ]);
  upstreamRes.headers.forEach((value, key) => {
    if (!blocked.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });

  // Force inline display — prevents the browser from showing a "Save File" dialog.
  // Also disable printing via the PDF plugin parameter hint.
  headers.set('content-disposition', 'inline');
  headers.set('cache-control', 'no-store');

  return new NextResponse(upstreamRes.body, {
    status: upstreamRes.status,
    headers,
  });
}
