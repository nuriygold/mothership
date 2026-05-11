import { createV2Task, getV2TasksFeed } from '../../../artifacts/mothership/dist/server/v2.js';
import { ensureV2Authorized, withErrorEnvelope } from '../../../artifacts/mothership/dist/lib/v2/auth.js';

function jsonError(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

export const GET = withErrorEnvelope(async () => {
  const feed = await getV2TasksFeed();
  return Response.json(feed);
});

export const POST = withErrorEnvelope(async (req?: Request) => {
  if (!req) {
    return jsonError('BAD_REQUEST', 'Request is required.', 400);
  }

  const unauthorized = ensureV2Authorized(req);
  if (unauthorized) {
    return unauthorized;
  }

  const body = (await req.json().catch(() => null)) as { title?: unknown; description?: unknown } | null;
  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  const description = typeof body?.description === 'string' ? body.description.trim() : undefined;

  if (!title) {
    return jsonError('BAD_REQUEST', 'title is required.', 400);
  }

  const task = await createV2Task({
    title,
    description: description || undefined,
  });

  return Response.json(task, { status: 201 });
});

export default async function handler(req: Request) {
  if (req.method === 'GET') {
    return GET();
  }

  if (req.method === 'POST') {
    return POST(req);
  }

  return new Response(null, {
    status: 405,
    headers: { Allow: 'GET, POST' },
  });
}
