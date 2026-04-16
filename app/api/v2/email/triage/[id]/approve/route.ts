import { type NextRequest, NextResponse } from 'next/server';
import { approveEmailTriage } from '@/lib/services/emailTriage';

export const dynamic = 'force-dynamic';

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const result = await approveEmailTriage(params.id);
  return NextResponse.json(result, { status: result.ok ? 200 : 404 });
}
