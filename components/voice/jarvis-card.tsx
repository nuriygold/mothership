'use client';

import { useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';

function getSupportedMimeType(): string {
  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
    'audio/mp4',
  ];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

async function transcribeAzure(audio: Blob) {
  const res = await fetch('/api/voice/stt', {
    method: 'POST',
    headers: { 'Content-Type': audio.type || 'audio/ogg' },
    body: audio,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message ?? 'STT failed');
  }
  return res.json();
}

async function dispatchOpenClaw(payload: { text: string; agentId?: string }) {
  const res = await fetch('/api/openclaw/dispatch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message ?? 'Failed to dispatch to OpenClaw');
  }
  return res.json();
}

export function JarvisCard() {
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [voiceStatus, setVoiceStatus] = useState<string>('');
  const [voiceError, setVoiceError] = useState<string>('');
  const [agent, setAgent] = useState('main');
  const [result, setResult] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const sttMutation = useMutation({
    mutationFn: transcribeAzure,
  });

  const ttsMutation = useMutation({
    mutationFn: async (text: string) => {
      const res = await fetch('/api/voice/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message ?? 'TTS failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (audioRef.current) {
        audioRef.current.src = url;
        await audioRef.current.play();
      }
      return true;
    },
    onError: (err: Error) => {
      setVoiceError(err?.message ?? 'TTS error');
      setVoiceStatus('Error');
    },
  });

  const openClawMutation = useMutation({
    mutationFn: dispatchOpenClaw,
    onSuccess: (payload) => setResult(payload?.result?.output ?? 'Dispatched.'),
  });

  const startRecording = async () => {
    setVoiceTranscript('');
    setVoiceError('');
    setVoiceStatus('Requesting mic...');
    audioChunksRef.current = [];

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const name = err instanceof Error ? err.name : '';
      const isDenied = name === 'NotAllowedError' || name === 'PermissionDeniedError';
      setVoiceStatus(isDenied ? 'Permission denied' : 'Mic error');
      setVoiceError(err instanceof Error ? err.message : String(err));
      throw err;
    }

    const mime = getSupportedMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    } catch (err) {
      stream.getTracks().forEach((t) => t.stop());
      const msg = err instanceof Error ? err.message : String(err);
      setVoiceStatus('Recorder error');
      setVoiceError(msg);
      throw err;
    }

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) audioChunksRef.current.push(event.data);
    };
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      setVoiceStatus('Transcribing...');
      const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
      try {
        const stt = await sttMutation.mutateAsync(blob as Blob);
        const text = stt?.text ?? '';
        setVoiceTranscript(text);
        if (text) {
          setVoiceStatus('Dispatching...');
          openClawMutation.mutate(
            { text, agentId: agent },
            {
              onSuccess: (payload) => {
                const output = payload?.result?.output ?? 'Dispatched.';
                setResult(output);
                setVoiceStatus('Speaking...');
                ttsMutation.mutate(output, { onSettled: () => setVoiceStatus('Idle') });
              },
              onError: () => setVoiceStatus('Error'),
            }
          );
        } else {
          setVoiceStatus('No transcript');
        }
      } catch (err) {
        setVoiceStatus('STT error');
        setVoiceError((err as Error)?.message ?? 'STT error');
      }
    };
    mediaRecorderRef.current = recorder;
    recorder.start();
    setVoiceListening(true);
    setVoiceStatus('Listening...');
  };

  const stopRecording = () => {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== 'inactive') {
      rec.stop();
    }
    setVoiceListening(false);
  };

  const toggleVoice = () => {
    if (voiceListening) {
      stopRecording();
    } else {
      startRecording().catch(() => {
        // Error already handled inside startRecording
      });
    }
  };

  return (
    <Card>
      <CardTitle>Voice (Jarvis)</CardTitle>
      <div className="mt-3 space-y-3 text-sm text-slate-200">
        <div className="flex items-center gap-3 flex-wrap">
          <Button onClick={toggleVoice} variant={voiceListening ? 'outline' : 'default'}>
            {voiceListening ? 'Stop Listening' : 'Push to Talk'}
          </Button>
          <select
            className="rounded-md border border-border bg-[var(--input-background)] px-2 py-1 text-xs"
            value={agent}
            onChange={(e) => setAgent(e.target.value)}
          >
            <option value="main">Adrian · main</option>
            <option value="ruby">Ruby · ruby</option>
            <option value="emerald">Emerald · emerald</option>
            <option value="adobe">Adobe Pettaway · adobe</option>
          </select>
          <span className="text-xs text-slate-400">{voiceStatus || 'Idle'}</span>
          {voiceError && <span className="text-xs text-rose-400">{voiceError}</span>}
          {(voiceError || voiceStatus?.startsWith('Error') || voiceStatus === 'STT error' || voiceStatus === 'Permission denied') && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setVoiceError('');
                setVoiceStatus('');
                startRecording().catch(() => {
                  // Error handled inside startRecording
                });
              }}
            >
              Retry
            </Button>
          )}
        </div>
        {voiceStatus === 'Permission denied' && (
          <p className="text-xs text-amber-400 rounded-md border border-amber-800/40 bg-amber-900/20 px-3 py-2">
            Microphone access was denied. Check your browser settings and allow microphone access for this site, then retry.
          </p>
        )}
        <div className="min-h-[48px] rounded-md border border-border bg-panel px-3 py-2 text-xs text-slate-100">
          {voiceTranscript || 'Transcript will appear here.'}
        </div>
        {result && (
          <pre className="whitespace-pre-wrap rounded-md border border-border bg-panel p-3 text-xs text-slate-200">
            {result}
          </pre>
        )}
        <audio ref={audioRef} hidden />
        {ttsMutation.isError && <p className="text-xs text-rose-400">TTS failed: {(ttsMutation.error as Error).message}</p>}
      </div>
    </Card>
  );
}
