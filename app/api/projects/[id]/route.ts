import { NextResponse } from 'next/server';
import { updateProject, assignCampaignToProject } from '@/lib/services/projects';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    if (body?.assignCampaignId !== undefined) {
      const updated = await assignCampaignToProject(String(body.assignCampaignId), params.id);
      return NextResponse.json(updated);
    }
    const updated = await updateProject(params.id, {
      title: body?.title ? String(body.title) : undefined,
      description: body?.description !== undefined ? (body.description ? String(body.description) : undefined) : undefined,
      color: body?.color ? String(body.color) : undefined,
      icon: body?.icon ? String(body.icon) : undefined,
      sortOrder: body?.sortOrder !== undefined ? Number(body.sortOrder) : undefined,
    });
    return NextResponse.json(updated);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    await prisma.project.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
