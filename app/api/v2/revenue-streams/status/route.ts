/**
 * GET  /api/v2/revenue-streams/status
 *   Returns latest status for all tracked revenue streams.
 *
 * POST /api/v2/revenue-streams/status
 *   Agent lead posts a status update.
 *   Requires header: x-mothership-v2-key
 *   Body: { stream: string, status: string, note?: string }
 *
 * PATCH /api/v2/revenue-streams/status
 *   UI pings a lead to request a status update.
 *   Body: { stream: string }
 */

import { prisma } from '@/lib/prisma';
import { ensureV2Authorized } from '@/lib/v2/auth';

export const dynamic = 'force-dynamic';

const VALID_STATUSES = ['idle', 'active', 'paused', 'needs-attention'] as const;

export async function GET() {
  try {
    const rows = await prisma.revenueStreamStatus.findMany({
      orderBy: { stream: 'asc' },
    });
    return Response.json({ streams: rows });
  } catch (error) {
    return Response.json(
      { error: { code: 'FETCH_FAILED', message: error instanceof Error ? error.message : 'Failed to fetch stream statuses' } },
      { status: 500 }
    );
  }
}

// Agents POST status updates via x-mothership-v2-key
export async function POST(req: Request) {
  const authError = ensureV2Authorized(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const stream = typeof body.stream === 'string' ? body.stream.trim() : '';
    const status = typeof body.status === 'string' ? body.status.trim() : '';
    const note   = typeof body.note   === 'string' ? body.note.trim() || null : null;

    if (!stream) {
      return Response.json(
        { error: { code: 'VALIDATION_ERROR', message: 'stream is required' } },
        { status: 400 }
      );
    }
    if (!VALID_STATUSES.includes(status as typeof VALID_STATUSES[number])) {
      return Response.json(
        { error: { code: 'VALIDATION_ERROR', message: `status must be one of: ${VALID_STATUSES.join(', ')}` } },
        { status: 400 }
      );
    }

    const row = await prisma.revenueStreamStatus.upsert({
      where: { stream },
      create: { stream, status, note },
      update: { status, note, requestedAt: null },
    });

    return Response.json({ stream: row });
  } catch (error) {
    return Response.json(
      { error: { code: 'UPDATE_FAILED', message: error instanceof Error ? error.message : 'Failed to update stream status' } },
      { status: 500 }
    );
  }
}

// UI pings a lead — marks requestedAt so agents know to check in
export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const stream = typeof body.stream === 'string' ? body.stream.trim() : '';

    if (!stream) {
      return Response.json(
        { error: { code: 'VALIDATION_ERROR', message: 'stream is required' } },
        { status: 400 }
      );
    }

    const row = await prisma.revenueStreamStatus.upsert({
      where: { stream },
      create: { stream, status: 'idle', requestedAt: new Date() },
      update: { requestedAt: new Date() },
    });

    return Response.json({ stream: row, pinged: true });
  } catch (error) {
    return Response.json(
      { error: { code: 'PING_FAILED', message: error instanceof Error ? error.message : 'Failed to ping lead' } },
      { status: 500 }
    );
  }
}
