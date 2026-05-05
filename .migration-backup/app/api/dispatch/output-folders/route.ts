import { NextResponse } from 'next/server';
import { listOutputFolders } from '@/lib/services/campaign-output';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const folders = listOutputFolders();
    return NextResponse.json({ folders });
  } catch {
    return NextResponse.json({ folders: [] });
  }
}
