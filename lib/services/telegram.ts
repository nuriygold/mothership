type TelegramBotKey = 'bot1' | 'bot2' | 'bot3' | 'default';

function getTokens() {
  const bot1 = process.env.TELEGRAM_BOT_TOKEN ?? '';
  const bot2 = process.env.TELEGRAM_BOT_TOKEN_2 ?? '';
  const bot3 = process.env.TELEGRAM_BOT_TOKEN_3 ?? '';
  const defaultKey = (process.env.TELEGRAM_DEFAULT_BOT_KEY as TelegramBotKey) ?? 'bot2';
  return {
    bot1,
    bot2,
    bot3,
    defaultKey,
  };
}

function resolveToken(botKey?: TelegramBotKey) {
  const tokens = getTokens();
  const key: TelegramBotKey =
    botKey && tokens[botKey as keyof typeof tokens]
      ? botKey
      : tokens.defaultKey ?? 'bot2';

  const token =
    (tokens[key as keyof typeof tokens] as string) ||
    tokens.bot2 ||
    tokens.bot1 ||
    tokens.bot3;
  return token || '';
}

export async function sendTelegramMessage(input: {
  text: string;
  chatId?: string;
  botKey?: TelegramBotKey;
}) {
  const token = resolveToken(input.botKey);
  const chatId = input.chatId ?? process.env.TELEGRAM_CHAT_ID ?? '';

  if (!token) {
    throw new Error('Telegram bot token missing');
  }
  if (!chatId) {
    throw new Error('Telegram chat id missing');
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: input.text,
      parse_mode: 'Markdown',
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram send failed: ${res.status} ${body}`);
  }

  return res.json();
}
