import { NextResponse } from 'next/server';
import { sendTelegramMessage } from '@/lib/services/telegram';

/**
 * POST /api/telegram/send
 *
 * Body: { text: string; botKey?: 'bot1' | 'bot2' | 'bot3' | 'botAdobe' }
 *
 * Error payload shape — only dispatch/page.tsx parses the body:
 *   { message: string }
 *
 * All other callers (today/page.tsx, take-action-modal, finance-event-action-modal,
 * telegram/page.tsx) only check res.ok / res.status — body is not parsed on error.
 *
 * Success: { ok: true } — return value is never read by any caller.
 */
export async function POST(request: Request) {
  let body: { text?: unknown; botKey?: unknown };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof body.text !== 'string' || !body.text.trim()) {
    return NextResponse.json({ message: 'text is required' }, { status: 400 });
  }

  const validBotKeys = ['bot1', 'bot2', 'bot3', 'botAdobe'] as const;
  type BotKey = typeof validBotKeys[number];
  const botKey =
    typeof body.botKey === 'string' && validBotKeys.includes(body.botKey as BotKey)
      ? (body.botKey as BotKey)
      : undefined;

  try {
    await sendTelegramMessage({ text: body.text.trim(), botKey });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({
      route: 'POST /api/telegram/send',
      error: message,
      botKey: botKey ?? 'default',
      timestamp: new Date().toISOString(),
    }));
    return NextResponse.json({ message }, { status: 502 });
  }
}
