import { SIX_GOD_SYSTEM_PROMPT, SIX_GOD_VOICE_ADDENDUM } from '@/lib/prompts/six-god';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DEFAULT_MODEL = process.env.OPENAI_REALTIME_MODEL ?? 'gpt-4o-realtime-preview-2024-12-17';
const DEFAULT_VOICE = process.env.OPENAI_REALTIME_VOICE ?? 'ash';

// ── Azure OpenAI Realtime (WebRTC) config ─────────────────────────────────
const AZURE_ENDPOINT = process.env.AZURE_OPENAI_REALTIME_ENDPOINT;           // e.g. https://<resource>.openai.azure.com
const AZURE_KEY = process.env.AZURE_OPENAI_REALTIME_KEY ?? process.env.AZURE_OPENAI_KEY;
const AZURE_DEPLOYMENT = process.env.AZURE_OPENAI_REALTIME_DEPLOYMENT;       // deployment name of a gpt-4o-realtime-preview model
const AZURE_API_VERSION = process.env.AZURE_OPENAI_REALTIME_API_VERSION ?? '2025-04-01-preview';
const AZURE_WEBRTC_BASE = process.env.AZURE_OPENAI_REALTIME_WEBRTC_BASE
  ?? 'https://eastus2.realtimeapi-preview.ai.azure.com/v1/realtimertc';
// OpenAI direct WebRTC base
const OPENAI_WEBRTC_BASE = 'https://api.openai.com/v1/realtime';

type SessionResponse = {
  client_secret: { value: string; expires_at?: number };
  model: string;
  voice?: string;
  base_url: string;  // Where the client should POST its SDP offer
};

/**
 * Mint an ephemeral Realtime session token on behalf of the browser.
 * Prefers Azure OpenAI when AZURE_OPENAI_REALTIME_ENDPOINT + KEY + DEPLOYMENT
 * are configured; otherwise uses OpenAI direct with OPENAI_API_KEY. The real
 * key never leaves the server.
 */
export async function POST() {
  const instructions = `${SIX_GOD_SYSTEM_PROMPT}\n\n${SIX_GOD_VOICE_ADDENDUM}`;

  if (AZURE_ENDPOINT && AZURE_KEY && AZURE_DEPLOYMENT) {
    const url = `${AZURE_ENDPOINT.replace(/\/$/, '')}/openai/realtimeapi/sessions?api-version=${AZURE_API_VERSION}`;
    const upstream = await fetch(url, {
      method: 'POST',
      headers: { 'api-key': AZURE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: AZURE_DEPLOYMENT,
        voice: DEFAULT_VOICE,
        instructions,
        modalities: ['audio', 'text'],
      }),
    });
    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => '');
      return Response.json(
        { error: `Azure realtime session failed (${upstream.status})`, detail },
        { status: 502 },
      );
    }
    const data = await upstream.json();
    const body: SessionResponse = {
      client_secret: data?.client_secret,
      model: AZURE_DEPLOYMENT,
      voice: data?.voice ?? DEFAULT_VOICE,
      base_url: AZURE_WEBRTC_BASE,
    };
    return Response.json(body);
  }

  const openAiKey = process.env.OPENAI_API_KEY;
  if (!openAiKey) {
    return Response.json(
      {
        error:
          'Realtime not configured. Set OPENAI_API_KEY for OpenAI direct, or AZURE_OPENAI_REALTIME_ENDPOINT + AZURE_OPENAI_REALTIME_KEY + AZURE_OPENAI_REALTIME_DEPLOYMENT for Azure OpenAI.',
      },
      { status: 500 },
    );
  }

  const upstream = await fetch('https://api.openai.com/v1/realtime/sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${openAiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      voice: DEFAULT_VOICE,
      instructions,
      modalities: ['audio', 'text'],
    }),
  });
  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => '');
    return Response.json(
      { error: `OpenAI realtime session failed (${upstream.status})`, detail },
      { status: 502 },
    );
  }
  const data = await upstream.json();
  const body: SessionResponse = {
    client_secret: data?.client_secret,
    model: data?.model ?? DEFAULT_MODEL,
    voice: data?.voice ?? DEFAULT_VOICE,
    base_url: OPENAI_WEBRTC_BASE,
  };
  return Response.json(body);
}
