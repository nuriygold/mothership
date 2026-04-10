import { ensureV2Authorized } from '@/lib/v2/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const ALLOWED_TYPES = new Set(['INCOME', 'EXPENSE', 'TRANSFER']);

export async function POST(req: Request) {
  const authError = ensureV2Authorized(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    const category = typeof body.category === 'string' ? body.category.trim() : null;
    const handledByBot = typeof body.handledByBot === 'string' ? body.handledByBot.trim() : 'Emerald';
    const accountId = typeof body.accountId === 'string' ? body.accountId.trim() : '';
    const type = typeof body.type === 'string' ? body.type.toUpperCase() : '';
    const rawAmount = Number(body.amount);
    const occurredAtInput = body.occurredAt ?? body.date;
    const occurredAt = occurredAtInput ? new Date(occurredAtInput) : new Date();

    if (!description) {
      return Response.json(
        { error: { code: 'VALIDATION_ERROR', message: 'description is required' } },
        { status: 400 }
      );
    }

    if (!accountId) {
      return Response.json(
        { error: { code: 'VALIDATION_ERROR', message: 'accountId is required' } },
        { status: 400 }
      );
    }

    if (!Number.isFinite(rawAmount) || rawAmount === 0) {
      return Response.json(
        { error: { code: 'VALIDATION_ERROR', message: 'amount must be a non-zero number' } },
        { status: 400 }
      );
    }

    if (!ALLOWED_TYPES.has(type)) {
      return Response.json(
        { error: { code: 'VALIDATION_ERROR', message: 'type must be INCOME, EXPENSE, or TRANSFER' } },
        { status: 400 }
      );
    }

    if (Number.isNaN(occurredAt.getTime())) {
      return Response.json(
        { error: { code: 'VALIDATION_ERROR', message: 'occurredAt must be a valid ISO date' } },
        { status: 400 }
      );
    }

    const account = await prisma.account.findUnique({ where: { id: accountId } });
    if (!account) {
      return Response.json(
        { error: { code: 'VALIDATION_ERROR', message: 'accountId does not reference an existing account' } },
        { status: 400 }
      );
    }

    const normalizedAmount =
      type === 'EXPENSE'
        ? -Math.abs(rawAmount)
        : type === 'TRANSFER'
          ? rawAmount
          : Math.abs(rawAmount);

    const [transaction] = await prisma.$transaction([
      prisma.transaction.create({
        data: {
          accountId,
          description,
          category,
          handledByBot,
          amount: normalizedAmount,
          occurredAt,
        },
        include: {
          account: true,
        },
      }),
      prisma.account.update({
        where: { id: accountId },
        data: {
          balance: {
            increment: normalizedAmount,
          },
        },
      }),
    ]);

    return Response.json({ transaction }, { status: 201 });
  } catch (error) {
    return Response.json(
      {
        error: {
          code: 'TRANSACTION_CREATE_FAILED',
          message: error instanceof Error ? error.message : 'Failed to create transaction',
        },
      },
      { status: 500 }
    );
  }
}
