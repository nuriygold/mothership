'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Card, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

async function fetchCommands() {
  const res = await fetch('/api/commands');
  return res.json();
}

async function postCommand(payload: { input: string; sourceChannel: string; requestedById?: string | null }) {
  const res = await fetch('/api/commands', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

async function sendTelegram(payload: { text: string; botKey?: string }) {
  const res = await fetch('/api/telegram/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message ?? 'Failed to send Telegram message');
  }
  return res.json();
}

async function dispatchOpenClaw(payload: { text: string; agentId?: string; sessionKey?: string }) {
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

async function checkGateway() {
  const res = await fetch('/api/openclaw/health');
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message ?? 'Gateway unreachable');
  }
  return res.json();
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

export default function CommandCenterPage() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['commands'], queryFn: fetchCommands });
  const gateway = useQuery({ queryKey: ['gateway'], queryFn: checkGateway, staleTime: 15_000 });
  const [input, setInput] = useState('');
  const [source, setSource] = useState('web');
  const [telegramMessage, setTelegramMessage] = useState('');
  const [telegramBot, setTelegramBot] = useState('bot2');
  const [ocText, setOcText] = useState('');
  const [ocAgent, setOcAgent] = useState('main');
  const [ocSession, setOcSession] = useState('');
  const [ocResult, setOcResult] = useState<string | null>(null);
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [voiceStatus, setVoiceStatus] = useState<string>('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [voiceError, setVoiceError] = useState<string>('');

  const mutation = useMutation({
    mutationFn: postCommand,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['commands'] });
      setInput('');
    },
  });

  const telegramMutation = useMutation({
    mutationFn: sendTelegram,
    onSuccess: () => setTelegramMessage(''),
  });

  const openClawMutation = useMutation({
    mutationFn: dispatchOpenClaw,
    onSuccess: (data) => setOcResult(data?.result?.output ?? 'Dispatched.'),
  });

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
    onError: (err: any) => {
      setVoiceError(err?.message ?? 'TTS error');
      setVoiceStatus('Error');
    },
  });

  const gatewayMutation = useMutation({
    mutationFn: checkGateway,
  });

  const startRecording = async () => {
    setVoiceTranscript('');
    setVoiceStatus('Listening…');
    audioChunksRef.current = [];
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg';
    const recorder = new MediaRecorder(stream, { mimeType: mime });
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) audioChunksRef.current.push(event.data);
    };
    recorder.onstop = async () => {
        setVoiceStatus('Transcribing…');
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType });
        try {
          const stt = await sttMutation.mutateAsync(blob as any);
          const text = stt?.text ?? '';
          setVoiceTranscript(text);
          if (text) {
            setVoiceStatus('Dispatching…');
            openClawMutation.mutate(
              { text, agentId: ocAgent },
              {
                onSuccess: (data) => {
                  const output = data?.result?.output ?? 'Dispatched.';
                  setOcResult(output);
                  setVoiceStatus('Speaking…');
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
          setVoiceError((err as any)?.message ?? 'STT error');
        }
      };
    mediaRecorderRef.current = recorder;
    recorder.start();
    setVoiceListening(true);
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
      startRecording().catch(() => setVoiceStatus('Mic blocked'));
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Command input</CardTitle>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400">Gateway</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                gateway.data?.ok ? 'bg-emerald-900/50 text-emerald-200' : 'bg-rose-900/50 text-rose-200'
              }`}
            >
              {gateway.isFetching
                ? 'Checking...'
                : gateway.data?.ok
                ? 'Reachable'
                : 'Unreachable'}
            </span>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <input
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-white"
            placeholder="Send instruction to OpenClaw/Dispatch-Bot bridge"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <select
            className="rounded-md border border-border bg-surface px-2 text-sm"
            value={source}
            onChange={(e) => setSource(e.target.value)}
          >
            <option value="web">web</option>
            <option value="telegram">telegram</option>
            <option value="api">api</option>
          </select>
          <Button onClick={() => mutation.mutate({ input, sourceChannel: source })} disabled={!input}>Submit</Button>
        </div>
        {mutation.isSuccess && (
          <p className="mt-2 text-xs text-emerald-300">Command accepted and logged.</p>
        )}
      </Card>

      <Card>
        <CardTitle>Telegram dispatch</CardTitle>
        <div className="mt-3 space-y-3">
          <textarea
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-white"
            rows={3}
            placeholder="Send a quick update or instruction to Telegram"
            value={telegramMessage}
            onChange={(e) => setTelegramMessage(e.target.value)}
          />
          <div className="flex items-center gap-3">
            <select
              className="rounded-md border border-border bg-surface px-2 text-sm"
              value={telegramBot}
              onChange={(e) => setTelegramBot(e.target.value)}
            >
              <option value="bot1">Bot 1</option>
              <option value="bot2">Bot 2 (default)</option>
              <option value="bot3">Bot 3</option>
              <option value="botAdobe">Adobe Bot</option>
            </select>
            <Button
              onClick={() => telegramMutation.mutate({ text: telegramMessage, botKey: telegramBot })}
              disabled={!telegramMessage || telegramMutation.isLoading}
            >
              Send
            </Button>
            {telegramMutation.isSuccess && (
              <p className="text-xs text-emerald-300">Sent to Telegram.</p>
            )}
            {telegramMutation.isError && (
              <p className="text-xs text-rose-400">Failed: {(telegramMutation.error as Error).message}</p>
            )}
          </div>
        </div>
      </Card>

      <Card>
        <CardTitle>OpenClaw dispatch</CardTitle>
        <div className="mt-3 space-y-3">
          <textarea
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-white"
            rows={3}
            placeholder="Send instruction to OpenClaw agents"
            value={ocText}
            onChange={(e) => setOcText(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <select
              className="rounded-md border border-border bg-surface px-2 py-1"
              value={ocAgent}
              onChange={(e) => setOcAgent(e.target.value)}
            >
              <option value="main">bot_one · Adrian · Mistral-Large-3</option>
              <option value="ruby">bot_two · Ruby · Codestral-2501</option>
              <option value="emerald">bot_three · Emerald · mistral-medium-2505</option>
            </select>
            <input
              className="w-48 rounded-md border border-border bg-surface px-2 py-1 text-xs text-white"
              placeholder="Session key (optional)"
              value={ocSession}
              onChange={(e) => setOcSession(e.target.value)}
            />
            <Button
              onClick={() =>
                openClawMutation.mutate({ text: ocText, agentId: ocAgent, sessionKey: ocSession || undefined })
              }
              disabled={!ocText || openClawMutation.isLoading}
            >
              Dispatch
            </Button>
            {openClawMutation.isError && (
              <p className="text-xs text-rose-400">Failed: {(openClawMutation.error as Error).message}</p>
            )}
          </div>
          <div className="mt-3 flex items-center gap-3 text-xs text-slate-300">
            <Button
              variant="outline"
              size="sm"
              onClick={() => gatewayMutation.mutate()}
              disabled={gatewayMutation.isLoading}
            >
              Check gateway
            </Button>
            {gatewayMutation.isSuccess && (
              <span className="text-emerald-300">Gateway OK</span>
            )}
            {gatewayMutation.isError && (
              <span className="text-rose-300">Gateway error: {(gatewayMutation.error as Error).message}</span>
            )}
          </div>
          {ocResult && (
            <pre className="whitespace-pre-wrap rounded-md border border-border bg-panel p-3 text-xs text-slate-200">
              {ocResult}
            </pre>
          )}
        </div>
      </Card>

      <Card>
        <CardTitle>Voice (Jarvis)</CardTitle>
        <div className="mt-3 space-y-3 text-sm text-slate-200">
          <div className="flex items-center gap-3">
            <Button onClick={toggleVoice} variant={voiceListening ? 'outline' : 'default'}>
              {voiceListening ? 'Stop Listening' : 'Push to Talk'}
            </Button>
            <select
              className="rounded-md border border-border bg-surface px-2 py-1 text-xs"
              value={ocAgent}
              onChange={(e) => setOcAgent(e.target.value)}
            >
              <option value="main">bot_one · Adrian</option>
              <option value="ruby">bot_two · Ruby</option>
              <option value="emerald">bot_three · Emerald</option>
            </select>
            <span className="text-xs text-slate-400">{voiceStatus || 'Idle'}</span>
            {voiceError && <span className="text-xs text-rose-400">{voiceError}</span>}
            {voiceStatus?.startsWith('Error') && (
              <Button size="sm" variant="outline" onClick={() => { setVoiceError(''); setVoiceStatus(''); }}>
                Clear
              </Button>
            )}
          </div>
          <div className="rounded-md border border-border bg-panel px-3 py-2 text-xs text-slate-100 min-h-[48px]">
            {voiceTranscript || 'Transcript will appear here.'}
          </div>
          {ocResult && (
            <pre className="whitespace-pre-wrap rounded-md border border-border bg-panel p-3 text-xs text-slate-200">
              {ocResult}
            </pre>
          )}
          <audio ref={audioRef} hidden />
          {ttsMutation.isError && (
            <p className="text-xs text-rose-400">TTS failed: {(ttsMutation.error as Error).message}</p>
          )}
        </div>
      </Card>

      <Card>
        <CardTitle>Recent commands</CardTitle>
        <div className="mt-3 space-y-3">
          {(data ?? []).map((cmd: any) => (
            <div key={cmd.id} className="rounded-lg border border-border p-3">
              <p className="text-sm text-white">{cmd.input}</p>
              <p className="text-xs text-slate-400">{cmd.sourceChannel} • {cmd.status}</p>
              {cmd.run && <p className="text-xs text-slate-500">Run: {cmd.run.type}</p>}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
