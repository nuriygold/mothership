import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Accepts audio/ogg (opus) or audio/webm (opus) from the client and forwards to Azure Speech-to-Text (standard REST).
export async function POST(req: Request) {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  const speechEndpoint = process.env.AZURE_SPEECH_ENDPOINT;

  if (!key || (!region && !speechEndpoint)) {
    return NextResponse.json({ message: 'AZURE_SPEECH_KEY and AZURE_SPEECH_REGION (or AZURE_SPEECH_ENDPOINT) required' }, { status: 500 });
  }

  try {
    const contentType = req.headers.get('content-type') || 'audio/ogg';
    const audioBuffer = await req.arrayBuffer();

    const endpoint = speechEndpoint
      ? `${speechEndpoint.replace(/\/$/, '')}/speech/recognition/conversation/cognitiveservices/v1?language=en-US&format=simple`
      : `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=en-US&format=simple`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'Content-Type': contentType,
      },
      body: audioBuffer,
    });

    if (!res.ok) {
      const body = await res.text();
      return NextResponse.json({ message: `Azure STT failed: ${res.status} ${body}` }, { status: 500 });
    }

    const json = await res.json();
    const text = json?.DisplayText ?? json?.NBest?.[0]?.Display ?? '';

    return NextResponse.json({ text });
  } catch (err: any) {
    return NextResponse.json({ message: String(err?.message ?? err) }, { status: 500 });
  }
}
