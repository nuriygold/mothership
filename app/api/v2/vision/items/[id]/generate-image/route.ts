import { ensureV2Authorized } from '@/lib/v2/auth';
import { generateVisionImage } from '@/lib/services/image-gen';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const authError = ensureV2Authorized(req);
  if (authError) return authError;

  const item = await prisma.visionItem.findUnique({ where: { id: params.id } });
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
    await prisma.visionItem.update({ where: { id: params.id }, data: { imageUrl } });
    return Response.json({ imageUrl });
  } catch (error) {
    return Response.json(
      { error: { message: error instanceof Error ? error.message : String(error) } },
      { status: 500 }
    );
  }
}
