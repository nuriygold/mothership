/**
 * PATCH /api/v2/finance/income-sources
 *
 * Three actions:
 *
 *  confirm        { id }                 — mark source as user-verified
 *  adjust-interval { id, interval }      — override detected interval (weekly/biweekly/monthly)
 *  ignore         { id }                 — delete source + resolve associated event
 */

import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const VALID_INTERVALS = ['weekly', 'biweekly', 'monthly'] as const;
type Interval = (typeof VALID_INTERVALS)[number];

const INTERVAL_DAYS: Record<Interval, number> = {
  weekly:   7,
  biweekly: 14,
  monthly:  30,
};

export async function PATCH(req: Request) {

  try {
    const body = await req.json();
    const id     = typeof body.id     === 'string' ? body.id.trim()     : '';
    const action = typeof body.action === 'string' ? body.action.trim() : '';

    if (!id) {
      return Response.json(
        { error: { code: 'VALIDATION_ERROR', message: 'id is required' } },
        { status: 400 }
      );
    }

    const source = await prisma.incomeSource.findUnique({ where: { id } });
    if (!source) {
      return Response.json(
        { error: { code: 'NOT_FOUND', message: 'Income source not found' } },
        { status: 404 }
      );
    }

    // ── Confirm ──────────────────────────────────────────────────────────────
    if (action === 'confirm') {
      const updated = await prisma.incomeSource.update({
        where: { id },
        data: { confirmed: true },
      });
      return Response.json({ source: updated, action: 'confirmed' });
    }

    // ── Adjust interval ───────────────────────────────────────────────────────
    if (action === 'adjust-interval') {
      const interval = body.interval as string | undefined;
      if (!interval || !VALID_INTERVALS.includes(interval as Interval)) {
        return Response.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: `interval must be one of: ${VALID_INTERVALS.join(', ')}`,
            },
          },
          { status: 400 }
        );
      }
      const updated = await prisma.incomeSource.update({
        where: { id },
        data: {
          interval,
          avgDays: INTERVAL_DAYS[interval as Interval],
          confirmed: true,  // manual override implies confirmation
        },
      });
      return Response.json({ source: updated, action: 'adjusted' });
    }

    // ── Ignore — remove from detector + resolve event ─────────────────────────
    if (action === 'ignore') {
      await prisma.incomeSource.delete({ where: { id } });

      // Resolve any open INCOME_SCHEDULE_DETECTED event for this source
      await prisma.financeEvent.updateMany({
        where: {
          type: 'INCOME_SCHEDULE_DETECTED',
          resolved: false,
          OR: [
            { payload: { path: ['employer'], equals: source.source } },
            { payload: { path: ['employer'], equals: source.source.toLowerCase() } },
          ],
        },
        data: { resolved: true },
      });

      return Response.json({ action: 'ignored', source: source.source });
    }

    return Response.json(
      { error: { code: 'UNKNOWN_ACTION', message: `Unknown action: ${action}` } },
      { status: 400 }
    );
  } catch (error) {
    return Response.json(
      {
        error: {
          code: 'INCOME_SOURCE_UPDATE_FAILED',
          message: error instanceof Error ? error.message : 'Failed to update income source',
        },
      },
      { status: 500 }
    );
  }
}
