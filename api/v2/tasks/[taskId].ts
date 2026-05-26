import type { IncomingMessage, ServerResponse } from 'node:http';

import { patchV2Task } from '../../../artifacts/mothership/src/server/v2';
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

function getTaskId(req: Request) {
  const url = new URL(req.url);
  const segments = url.pathname.split('/').filter(Boolean);
  return segments.at(-1) ?? '';
}

export const PATCH = withErrorEnvelope(async (req?: Request) => {
  if (!req) {
    return Response.json({ error: { code: 'BAD_REQUEST', message: 'Request is required.' } }, { status: 400 });
  }

  const unauthorized = ensureV2Authorized(req);
  if (unauthorized) {
    return unauthorized;
  }

  const taskId = getTaskId(req).trim();
  if (!taskId) {
    return Response.json({ error: { code: 'BAD_REQUEST', message: 'taskId is required.' } }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as { action?: unknown; ownerLogin?: unknown } | null;
  const action = typeof body?.action === 'string' ? body.action : undefined;
  const ownerLogin = typeof body?.ownerLogin === 'string' ? body.ownerLogin.trim() : undefined;

  await patchV2Task(taskId, {
    action: action as Parameters<typeof patchV2Task>[1]['action'],
    ownerLogin,
  });

  return new Response(null, { status: 204 });
});

function readBody(req: IncomingMessage) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const host = String(req.headers.host ?? 'localhost');
  const url = new URL(String(req.url ?? '/'), `http://${host}`);
  const method = String(req.method ?? 'GET').toUpperCase();

  try {
    if (method === 'PATCH') {
      const body = await readBody(req);
      const bodyInit = body.length ? new Uint8Array(body) : undefined;
      const request = new Request(url.toString(), {
        method,
        headers: new Headers(req.headers as Record<string, string>),
        body: bodyInit,
      });
      const out = await PATCH(request);
      res.statusCode = out.status;
      out.headers.forEach((v, k) => res.setHeader(k, v));
      res.end(Buffer.from(await out.arrayBuffer()));
      return;
    }

    res.statusCode = 405;
    res.setHeader('allow', 'PATCH');
    res.end();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    jsonError(res, 'TASKS_V2_ERROR', message, 500);
  }
}
