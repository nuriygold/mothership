import type { IncomingMessage, ServerResponse } from 'node:http';

import { createV2Task, getV2TasksFeed } from '../../../artifacts/mothership/src/server/v2';
import { ensureV2Authorized, withErrorEnvelope } from '../../../artifacts/mothership/src/lib/v2/auth';

type JsonErrorBody = { error: { code: string; message: string } };

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

export const GET = withErrorEnvelope(async () => {
  const feed = await getV2TasksFeed();
  return Response.json(feed);
});

export const POST = withErrorEnvelope(async (req?: Request) => {
  if (!req) {
    return Response.json({ error: { code: 'BAD_REQUEST', message: 'Request is required.' } }, { status: 400 });
  }

  const unauthorized = ensureV2Authorized(req);
  if (unauthorized) {
    return unauthorized;
  }

  const body = (await req.json().catch(() => null)) as { title?: unknown; description?: unknown } | null;
  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  const description = typeof body?.description === 'string' ? body.description.trim() : undefined;

  if (!title) {
    return Response.json({ error: { code: 'BAD_REQUEST', message: 'title is required.' } }, { status: 400 });
  }

  const task = await createV2Task({
    title,
    description: description || undefined,
  });

  return Response.json(task, { status: 201 });
});

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const host = String(req.headers.host ?? 'localhost');
  const url = new URL(String(req.url ?? '/'), `http://${host}`);
  const method = String(req.method ?? 'GET').toUpperCase();

  try {
    if (method === 'GET') {
      const out = await GET();
      res.statusCode = out.status;
      out.headers.forEach((v, k) => res.setHeader(k, v));
      res.end(Buffer.from(await out.arrayBuffer()));
      return;
    }

    if (method === 'POST') {
      const body = await readBody(req);
      const bodyInit = body.length ? new Uint8Array(body) : undefined;
      const request = new Request(url.toString(), {
        method,
        headers: new Headers(req.headers as Record<string, string>),
        body: bodyInit,
      });
      const out = await POST(request);
      res.statusCode = out.status;
      out.headers.forEach((v, k) => res.setHeader(k, v));
      res.end(Buffer.from(await out.arrayBuffer()));
      return;
    }

    res.statusCode = 405;
    res.setHeader('allow', 'GET, POST');
    res.end();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    jsonError(res, 'TASKS_V2_ERROR', message, 500);
  }
}
