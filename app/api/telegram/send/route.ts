import { NextResponse } from 'next/server';
import { sendTelegramMessage } from '@/lib/services/telegram';
import { createAuditEvent } from '@/lib/services/audit';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const text = String(body?.text ?? '').trim();
    const botKey = body?.botKey as 'bot1' | 'bot2' | 'bot3' | 'default' | undefined;
    const chatId = body?.chatId ? String(body.chatId) : (process.env.TELEGRAM_CHAT_ID || '0');

    if (!text) {
      return NextResponse.json({ message: 'Text is required' }, { status: 400 });
    }

    // Log as inbound (going TO the bot)
    await createAuditEvent({
      entityType: 'telegram',
      entityId: `console-${Date.now()}`,
      eventType: 'telegram_inbound',
      metadata: { 
        text, 
        botKey: botKey ?? 'default', 
        chatId,
        username: 'console_user'
      },
    });

    // Trigger the webhook logic to process the message (fire and forget)
    const protocol = req.headers.get('x-forwarded-proto') || 'http';
    const host = req.headers.get('host');
    if (host) {
      const webhookUrl = `${protocol}://${host}/api/telegram/webhook`;
      void fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botKey,
          update_id: Date.now(),
          message: {
            message_id: Math.floor(Math.random() * 1000000),
            from: { id: 999999, is_bot: false, first_name: 'Console', username: 'console' },
            chat: { id: parseInt(chatId), type: 'private' },
            date: Math.floor(Date.now() / 1000),
            text,
          },
        }),
      }).catch(e => console.error('Console webhook trigger failed:', e));
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: 'Failed to send Telegram message', error: String(error) },
      { status: 500 }
    );
  }
}
