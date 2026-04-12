import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Accepts audio/ogg (opus) or audio/webm (opus) from the client and forwards to Azure Speech-to-Text (standard REST).
export async function POST(req: Request) {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;

  if (!key || !region) {
    return NextResponse.json({ message: 'AZURE_SPEECH_KEY or AZURE_SPEECH_REGION missing' }, { status: 500 });
  }

  try {
    const contentType = req.headers.get('content-type') || 'audio/ogg';
    const audioBuffer = await req.arrayBuffer();

    const endpoint = `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=en-US&format=simple`;

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

    // Azure returns HTTP 200 even for recognition failures — check the status field.
    const recognitionStatus = json?.RecognitionStatus as string | undefined;
    if (recognitionStatus && recognitionStatus !== 'Success') {
      console.error(JSON.stringify({ scope: 'stt', azureStatus: recognitionStatus, raw: json }));
      return NextResponse.json(
        { message: `Azure STT recognition failed: ${recognitionStatus}` },
        { status: 422 }
      );
    }

    const text = json?.DisplayText ?? json?.NBest?.[0]?.Display ?? '';
    return NextResponse.json({ text });
  } catch (err: any) {
    return NextResponse.json({ message: String(err?.message ?? err) }, { status: 500 });
  }
}
