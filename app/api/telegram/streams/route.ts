import { NextResponse } from 'next/server';
import { listAuditEvents } from '@/lib/services/audit';

export const dynamic = 'force-dynamic';

type TelegramStreamEvent = {
  id: string;
  timestamp: string;
  direction: 'inbound' | 'outbound';
  text: string;
  chatId: string;
  botKey: string;
  agentLabel: string;
};

const BOT_TO_AGENT: Record<string, string> = {
  bot1: 'Adrian',
  bot2: 'Ruby',
  bot3: 'Emerald',
  botAdobe: 'Adobe',
  default: 'Default Bot',
  webhook: 'Webhook',
};

function toText(value: unknown) {
  return typeof value === 'string' ? value : '';
}

export async function GET() {
  const events = await listAuditEvents(500);

  const telegramEvents: TelegramStreamEvent[] = events
    .filter((event: any) => event.eventType === 'telegram_outbound' || event.eventType === 'telegram_inbound')
    .map((event: any) => {
      const metadata = (event.metadata ?? {}) as Record<string, unknown>;
      const direction = event.eventType === 'telegram_inbound' ? 'inbound' : 'outbound';
      const botKey = toText(metadata.botKey) || (direction === 'inbound' ? 'webhook' : 'default');
      const text = toText(metadata.text) || toText(metadata.command) || '—';
      const chatId = toText(metadata.chatId) || 'unknown';
      return {
        id: event.id,
        timestamp: new Date(event.createdAt).toISOString(),
        direction,
        text,
        chatId,
        botKey,
        agentLabel: BOT_TO_AGENT[botKey] ?? botKey,
      };
    });

  return NextResponse.json({ events: telegramEvents });
}
