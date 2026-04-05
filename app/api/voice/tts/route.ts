import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  const voice = process.env.AZURE_SPEECH_VOICE ?? 'en-US-Aria:DragonHDLatestNeural';

  if (!key || !region) {
    return NextResponse.json({ message: 'AZURE_SPEECH_KEY or AZURE_SPEECH_REGION missing' }, { status: 500 });
  }

  try {
    const { text, voiceId } = await req.json();
    if (!text || typeof text !== 'string') {
      return NextResponse.json({ message: 'text is required' }, { status: 400 });
    }

    const endpoint = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
    const voiceName = voiceId || voice;
    const ssml = `<?xml version="1.0" encoding="UTF-8"?>
<speak version="1.0" xml:lang="en-US">
  <voice xml:lang="en-US" name="${voiceName}">${text}</voice>
</speak>`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'Ocp-Apim-Subscription-Region': region,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
      },
      body: ssml,
    });

    if (!res.ok) {
      const body = await res.text();
      return NextResponse.json({ message: `Azure TTS failed: ${res.status} ${body}` }, { status: 500 });
    }

    const audio = Buffer.from(await res.arrayBuffer());
    return new NextResponse(audio, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': audio.length.toString(),
      },
    });
  } catch (err: any) {
    return NextResponse.json({ message: String(err?.message ?? err) }, { status: 500 });
  }
}
