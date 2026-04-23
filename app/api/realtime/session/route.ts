import { SIX_GOD_SYSTEM_PROMPT, SIX_GOD_VOICE_ADDENDUM } from '@/lib/prompts/six-god';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DEFAULT_MODEL = process.env.OPENAI_REALTIME_MODEL ?? 'gpt-4o-realtime-preview-2024-12-17';
const DEFAULT_VOICE = process.env.OPENAI_REALTIME_VOICE ?? 'ash';

/**
 * Mint an ephemeral OpenAI Realtime session token on behalf of the browser.
 * The client uses `client_secret.value` as the Bearer token when establishing
 * the WebRTC connection directly to OpenAI — the real API key never leaves
 * the server.
 */
export async function POST() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: 'OPENAI_API_KEY is not configured on the server.' },
      { status: 500 },
    );
  }

  const instructions = `${SIX_GOD_SYSTEM_PROMPT}\n\n${SIX_GOD_VOICE_ADDENDUM}`;

  const upstream = await fetch('https://api.openai.com/v1/realtime/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      voice: DEFAULT_VOICE,
      instructions,
      modalities: ['audio', 'text'],
    }),
  });

  if (!upstream.ok) {
    const body = await upstream.text().catch(() => '');
    return Response.json(
      { error: `OpenAI realtime session failed (${upstream.status})`, detail: body },
      { status: 502 },
    );
  }

  const data = await upstream.json();
  return Response.json(data);
}
