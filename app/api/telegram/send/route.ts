import { NextResponse } from 'next/server';
import { sendTelegramMessage } from '@/lib/services/telegram';
import { createAuditEvent } from '@/lib/services/audit';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const text = String(body?.text ?? '').trim();
    const botKey = body?.botKey as 'bot1' | 'bot2' | 'bot3' | 'default' | undefined;
    const chatId = body?.chatId ? String(body.chatId) : undefined;

    if (!text) {
      return NextResponse.json({ message: 'Text is required' }, { status: 400 });
    }

    const result = await sendTelegramMessage({ text, botKey, chatId });

    await createAuditEvent({
      entityType: 'telegram',
      entityId: String(result?.result?.message_id ?? Date.now()),
      eventType: 'telegram_outbound',
      metadata: { text, botKey: botKey ?? 'default', chatId: chatId ?? process.env.TELEGRAM_CHAT_ID ?? '' },
    });

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: 'Failed to send Telegram message', error: String(error) },
      { status: 500 }
    );
  }
}
