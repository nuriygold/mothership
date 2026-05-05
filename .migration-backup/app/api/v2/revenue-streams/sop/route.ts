import { promises as fs } from 'fs';
import { streamDefByKey } from '@/lib/v2/revenue-streams-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get('stream')?.trim() ?? '';

  const def = await streamDefByKey(key);
  if (!def) {
    return Response.json({ error: 'Stream not found' }, { status: 404 });
  }

  try {
    const [markdown, stat] = await Promise.all([
      fs.readFile(def.sopPath, 'utf-8'),
      fs.stat(def.sopPath),
    ]);
    const title = markdown.split('\n')[0].replace(/^#+\s*/, '').trim() || def.displayName;
    return Response.json({ key, title, markdown, updatedAt: stat.mtime.toISOString() });
  } catch {
    return Response.json({ error: 'SOP file not found' }, { status: 404 });
  }
}
