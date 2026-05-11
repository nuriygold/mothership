import { patchV2Task } from '../../../artifacts/mothership/dist/server/v2.js';
import { ensureV2Authorized, withErrorEnvelope } from '../../../artifacts/mothership/dist/lib/v2/auth.js';

function jsonError(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

function getTaskId(req: Request) {
  const url = new URL(req.url);
  const segments = url.pathname.split('/').filter(Boolean);
  return segments.at(-1) ?? '';
}

export const PATCH = withErrorEnvelope(async (req?: Request) => {
  if (!req) {
    return jsonError('BAD_REQUEST', 'Request is required.', 400);
  }

  const unauthorized = ensureV2Authorized(req);
  if (unauthorized) {
    return unauthorized;
  }

  const taskId = getTaskId(req).trim();
  if (!taskId) {
    return jsonError('BAD_REQUEST', 'taskId is required.', 400);
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

export default async function handler(req: Request) {
  if (req.method === 'PATCH') {
    return PATCH(req);
  }

  return new Response(null, {
    status: 405,
    headers: { Allow: 'PATCH' },
  });
}
