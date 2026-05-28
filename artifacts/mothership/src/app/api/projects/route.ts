import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { listProjects } from '@/lib/services/projects';
import { db } from '@/lib/db/client';
import { projects } from '@/lib/db/schema';

/**
 * GET /api/projects
 *
 * Fields accessed by projects/page.tsx (Project[]):
 *   id, title, description, color, icon, sortOrder, isDefault
 *   campaigns[].id, .title, .status
 *   campaigns[].tasks[].status
 *
 * Also used by dispatch/page.tsx as: { id, title, color }[]
 *
 * POST /api/projects
 * Body: { title, description?, color, icon }
 * Success: { project: { id } }
 * Error:   { error: string }
 */

export async function GET() {
  try {
    const data = await listProjects();
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({ route: 'GET /api/projects', error: message, timestamp: new Date().toISOString() }));
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body.title !== 'string' || !body.title.trim()) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 });
    }

    const [project] = await db
      .insert(projects)
      .values({
        id: randomUUID(),
        title: body.title.trim(),
        description: body.description?.trim() || null,
        color: body.color || 'lavender',
        icon: body.icon || 'folder',
        sortOrder: 999,
        isDefault: false,
      })
      .returning({ id: projects.id });

    return NextResponse.json({ project }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({ route: 'POST /api/projects', error: message, timestamp: new Date().toISOString() }));
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
