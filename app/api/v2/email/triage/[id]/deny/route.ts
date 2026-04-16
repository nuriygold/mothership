import { type NextRequest, NextResponse } from 'next/server';
import { denyEmailTriage } from '@/lib/services/emailTriage';

export const dynamic = 'force-dynamic';

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const result = await denyEmailTriage(params.id);
  return NextResponse.json(result);
}
