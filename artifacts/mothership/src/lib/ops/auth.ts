import { NextResponse } from 'next/server';
import { getOwnerId } from '@/lib/services/owner';

export async function requireOpsAuth() {
  const ownerId = await getOwnerId();
  if (!ownerId) {
    return { ok: false as const, response: NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 }) };
  }
  return { ok: true as const, ownerId };
}

