import { prisma } from '@/lib/prisma';
import { createFinanceEvent } from '@/lib/finance/events';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {

  try {
    const body = await req.json();
    const vendor = typeof body.vendor === 'string' ? body.vendor.trim() : '';
    const description = typeof body.description === 'string' ? body.description.trim() : null;
    const amount = Number(body.amount);
    const dueDate = body.dueDate ? new Date(body.dueDate) : null;

    if (!vendor) {
      return Response.json(
        { error: { code: 'VALIDATION_ERROR', message: 'vendor is required' } },
        { status: 400 }
      );
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return Response.json(
        { error: { code: 'VALIDATION_ERROR', message: 'amount must be a positive number' } },
        { status: 400 }
      );
    }

    if (dueDate && Number.isNaN(dueDate.getTime())) {
      return Response.json(
        { error: { code: 'VALIDATION_ERROR', message: 'dueDate must be a valid ISO date' } },
        { status: 400 }
      );
    }

    const payable = await prisma.payable.create({
      data: {
        vendor,
        description,
        amount,
        dueDate,
        status: 'pending',
      },
    });

    createFinanceEvent('BILL_DUE', 'payables', {
      vendor: payable.vendor,
      amount: payable.amount,
      dueDate: payable.dueDate ? payable.dueDate.toISOString().slice(0, 10) : null,
      priority: 'normal',
    }).catch(() => {});

    return Response.json({ payable }, { status: 201 });
  } catch (error) {
    return Response.json(
      {
        error: {
          code: 'PAYABLE_CREATE_FAILED',
          message: error instanceof Error ? error.message : 'Failed to create payable',
        },
      },
      { status: 500 }
    );
  }
}
