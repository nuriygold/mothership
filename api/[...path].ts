import type { IncomingMessage, ServerResponse } from 'node:http';

type JsonErrorBody = { error: { code: string; message: string } };

function upstreamBaseUrl() {
  const raw = String(process.env.API_BASE_URL ?? '').trim();
  return raw ? raw.replace(/\/$/, '') : '';
}

function writeJson(res: ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('content-length', Buffer.byteLength(payload));
  res.end(payload);
}

function jsonError(res: ServerResponse, code: string, message: string, status: number) {
  const body: JsonErrorBody = { error: { code, message } };
  writeJson(res, status, body);
}

function readBody(req: IncomingMessage) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function buildUpstreamUrl(req: IncomingMessage, baseUrl: string) {
  const host = String(req.headers.host ?? 'localhost');
  const incoming = new URL(String(req.url ?? '/'), `http://${host}`);
  const upstreamPath = incoming.pathname.replace(/^\/api/, '') || '/';
  return `${baseUrl}${upstreamPath}${incoming.search}`;
}

function forwardableHeaders(req: IncomingMessage) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (!value) continue;
    const lower = key.toLowerCase();
    if (lower === 'host' || lower === 'content-length') continue;
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else {
      headers.set(key, value);
    }
  }
  return headers;
}

function setResponseHeaders(res: ServerResponse, upstream: Response) {
  upstream.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower === 'content-length' || lower === 'content-encoding') return;
    res.setHeader(key, value);
  });
}

async function proxyToExpressNode(req: IncomingMessage, res: ServerResponse) {
  const baseUrl = upstreamBaseUrl();
  if (!baseUrl) {
    jsonError(
      res,
      'API_PROXY_NOT_CONFIGURED',
      'API_BASE_URL must point at the Express API origin for production /api routing.',
      503,
    );
    return;
  }

  const method = String(req.method ?? 'GET').toUpperCase();
  const body =
    method === 'GET' || method === 'HEAD'
      ? undefined
      : await readBody(req);
  const bodyInit = body && body.length ? new Uint8Array(body) : undefined;

  const upstream = await fetch(buildUpstreamUrl(req, baseUrl), {
    method,
    headers: forwardableHeaders(req),
    body: bodyInit,
    redirect: 'manual',
  });

  res.statusCode = upstream.status;
  if (upstream.statusText) res.statusMessage = upstream.statusText;
  setResponseHeaders(res, upstream);

  if (!upstream.body) {
    res.end();
    return;
  }

  const ab = await upstream.arrayBuffer();
  res.end(Buffer.from(ab));
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    await proxyToExpressNode(req, res);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    jsonError(res, 'API_PROXY_ERROR', message, 502);
  }
}
