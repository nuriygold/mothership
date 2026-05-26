function jsonError(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

function upstreamBaseUrl() {
  const raw = String(process.env.API_BASE_URL ?? '').trim();
  return raw ? raw.replace(/\/$/, '') : '';
}

function buildUpstreamUrl(req: Request, baseUrl: string) {
  const incoming = new URL(req.url);
  const upstreamPath = incoming.pathname.replace(/^\/api/, '') || '/';
  return `${baseUrl}${upstreamPath}${incoming.search}`;
}

function forwardableHeaders(req: Request) {
  const headers = new Headers(req.headers);
  headers.delete('host');
  headers.delete('content-length');
  return headers;
}

function responseHeaders(res: Response) {
  const headers = new Headers(res.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  return headers;
}

async function proxyToExpress(req: Request) {
  const baseUrl = upstreamBaseUrl();
  if (!baseUrl) {
    return jsonError(
      'API_PROXY_NOT_CONFIGURED',
      'API_BASE_URL must point at the Express API origin for production /api routing.',
      503,
    );
  }

  const body =
    req.method === 'GET' || req.method === 'HEAD'
      ? undefined
      : await req.arrayBuffer();

  const upstream = await fetch(buildUpstreamUrl(req, baseUrl), {
    method: req.method,
    headers: forwardableHeaders(req),
    body,
    redirect: 'manual',
  });

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders(upstream),
  });
}

export const GET = proxyToExpress;
export const POST = proxyToExpress;
export const PUT = proxyToExpress;
export const PATCH = proxyToExpress;
export const DELETE = proxyToExpress;
export const OPTIONS = proxyToExpress;
export const HEAD = proxyToExpress;

export default proxyToExpress;
