import { type NextRequest, NextResponse } from 'next/server';
import { addShoppingItem, listShoppingItems } from '@/lib/services/shopping';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const includeCompleted = req.nextUrl.searchParams.get('includeCompleted') === 'true';
  const items = await listShoppingItems(includeCompleted);
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  let body: { name?: string; notes?: string; source?: string } = {};
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }
  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'name is required.' }, { status: 400 });
  }
  const item = await addShoppingItem({ name: body.name, notes: body.notes, source: body.source ?? 'manual' });
  return NextResponse.json({ ok: true, item }, { status: 201 });
}
