import { generateVisionImage } from '@/lib/services/image-gen';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { visionItems } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const [item] = await db.select().from(visionItems).where(eq(visionItems.id, params.id)).limit(1);
  if (!item) return Response.json({ error: { message: 'Item not found' } }, { status: 404 });

  let customPrompt: string | null = null;
  try {
    const body = await req.json();
    customPrompt = body?.customPrompt ?? null;
  } catch {
    // no body or not JSON — that's fine
  }

  try {
    const imageUrl = await generateVisionImage(params.id, item.title, item.description, customPrompt);
    await db.update(visionItems).set({ imageUrl, updatedAt: new Date() }).where(eq(visionItems.id, params.id));
    return Response.json({ imageUrl });
  } catch (error) {
    return Response.json(
      { error: { message: error instanceof Error ? error.message : String(error) } },
      { status: 500 }
    );
  }
}
