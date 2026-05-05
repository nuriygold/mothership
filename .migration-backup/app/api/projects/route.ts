import { NextResponse } from 'next/server';
import { listProjects, createProject } from '@/lib/services/projects';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const projects = await listProjects();
    return NextResponse.json(projects);
  } catch {
    return NextResponse.json([]);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const title = String(body?.title ?? '').trim();
    if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 });
    const project = await createProject({
      title,
      description: body?.description ? String(body.description) : undefined,
      color: body?.color ? String(body.color) : undefined,
      icon: body?.icon ? String(body.icon) : undefined,
    });
    return NextResponse.json(project, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
