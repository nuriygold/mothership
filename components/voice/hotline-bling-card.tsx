'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Phone, PhoneOff, Loader2 } from 'lucide-react';
import { Card, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type ConnectionMode = 'webrtc' | 'azure-ws';
type CallStatus = 'checking' | 'unconfigured' | 'idle' | 'connecting' | 'live' | 'ending' | 'error';
type TranscriptLine = { role: 'user' | 'assistant'; text: string };

interface SessionResponse {
  mode?: ConnectionMode;
  client_secret?: { value?: string };
  model?: string;
  voice?: string;
  base_url?: string;
  error?: string;
  detail?: string;
}

// ─── PCM16 helpers (Azure WebSocket mode) ────────────────────────────────────

function float32ToPcm16Base64(float32: Float32Array): string {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 32768 : s * 32767;
  }
  const bytes = new Uint8Array(int16.buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function pcm16Base64ToFloat32(b64: string): Float32Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const int16 = new Int16Array(bytes.buffer);
  const f32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) f32[i] = int16[i] / 32768;
  return f32;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function HotlineBlingCard() {
  const [status, setStatus] = useState<CallStatus>('checking');
  const [mode, setMode] = useState<ConnectionMode | null>(null);
  const [error, setError] = useState('');
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);

  // WebRTC refs
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  // Azure WebSocket refs
  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextPlayAtRef = useRef(0);

  // Shared
  const micStreamRef = useRef<MediaStream | null>(null);
  const assistantBufferRef = useRef('');

  // ── Config check ────────────────────────────────────────────────────────────

  useEffect(() => {
    fetch('/api/realtime/session', { method: 'POST' })
      .then((r) => r.json())
      .then((d: SessionResponse) => {
        if (d.error || !d.mode) {
          setStatus('unconfigured');
        } else {
          setMode(d.mode);
          setStatus('idle');
        }
      })
      .catch(() => setStatus('unconfigured'));
  }, []);

  // ── Shared teardown ─────────────────────────────────────────────────────────

  const teardown = useCallback(() => {
    try { dataChannelRef.current?.close(); } catch { /* */ }
    dataChannelRef.current = null;
    try { pcRef.current?.close(); } catch { /* */ }
    pcRef.current = null;
    if (audioElRef.current) { audioElRef.current.pause(); audioElRef.current.srcObject = null; }

    wsRef.current?.close();
    wsRef.current = null;
    processorRef.current?.disconnect();
    processorRef.current = null;
    if (audioCtxRef.current?.state !== 'closed') audioCtxRef.current?.close().catch(() => { /* */ });
    audioCtxRef.current = null;
    nextPlayAtRef.current = 0;

    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    assistantBufferRef.current = '';
  }, []);

  useEffect(() => () => { teardown(); }, [teardown]);

  // ── Realtime event handler (shared protocol) ─────────────────────────────────

  const handleEvent = useCallback((raw: string) => {
    let evt: { type?: string; delta?: string; transcript?: string };
    try { evt = JSON.parse(raw); } catch { return; }

    switch (evt.type) {
      case 'response.audio_transcript.delta':
        if (typeof evt.delta === 'string') {
          assistantBufferRef.current += evt.delta;
          setTranscript((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role === 'assistant') {
              next[next.length - 1] = { role: 'assistant', text: assistantBufferRef.current };
            } else {
              next.push({ role: 'assistant', text: assistantBufferRef.current });
            }
            return next;
          });
        }
        break;
      case 'response.audio_transcript.done':
        assistantBufferRef.current = '';
        break;
      case 'conversation.item.input_audio_transcription.completed':
        if (typeof evt.transcript === 'string' && evt.transcript.trim()) {
          setTranscript((prev) => [...prev, { role: 'user', text: evt.transcript!.trim() }]);
        }
        break;
    }
  }, []);

  // ── Azure VoiceLive WebSocket path ──────────────────────────────────────────

  const connectAzureWs = useCallback(async () => {
    let mic: MediaStream;
    try {
      mic = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 24000, channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      micStreamRef.current = mic;
    } catch (err) {
      const name = err instanceof Error ? err.name : '';
      throw new Error(name === 'NotAllowedError' ? 'Microphone permission denied.' : `Microphone error: ${String(err)}`);
    }

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${window.location.host}/api/voice/realtime`);
    wsRef.current = ws;

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Connection timeout')), 12000);
      ws.onopen = () => {
        clearTimeout(timeout);
        // Set audio format + VAD; voice/instructions come from the Azure portal agent config
        ws.send(JSON.stringify({
          type: 'session.update',
          session: {
            input_audio_format: 'pcm16',
            output_audio_format: 'pcm16',
            input_audio_transcription: { model: 'whisper-1' },
            turn_detection: { type: 'server_vad', threshold: 0.5, prefix_padding_ms: 300, silence_duration_ms: 500 },
          },
        }));
        resolve();
      };
      ws.onerror = () => { clearTimeout(timeout); reject(new Error('WebSocket connection failed — check server logs')); };
    });

    const audioCtx = new AudioContext({ sampleRate: 24000 });
    audioCtxRef.current = audioCtx;
    nextPlayAtRef.current = audioCtx.currentTime;

    const source = audioCtx.createMediaStreamSource(mic);
    const processor = audioCtx.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;

    processor.onaudioprocess = (e) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: float32ToPcm16Base64(e.inputBuffer.getChannelData(0)) }));
    };

    source.connect(processor);
    processor.connect(audioCtx.destination);

    ws.onmessage = (e) => {
      let msg: { type?: string; delta?: string; error?: { message?: string }; [k: string]: unknown };
      try { msg = JSON.parse(e.data as string); } catch { return; }

      if (msg.type === 'response.audio.delta' && msg.delta && audioCtxRef.current) {
        const f32 = pcm16Base64ToFloat32(msg.delta);
        const buf = audioCtxRef.current.createBuffer(1, f32.length, 24000);
        buf.getChannelData(0).set(f32);
        const src = audioCtxRef.current.createBufferSource();
        src.buffer = buf;
        src.connect(audioCtxRef.current.destination);
        const when = Math.max(audioCtxRef.current.currentTime, nextPlayAtRef.current);
        src.start(when);
        nextPlayAtRef.current = when + buf.duration;
      }

      if (msg.type === 'session.updated') setStatus('live');
      if (msg.type === 'error') {
        setError(msg.error?.message ?? 'Realtime error');
        setStatus('error');
        teardown();
        return;
      }

      handleEvent(e.data as string);
    };

    ws.onclose = () => {
      if (micStreamRef.current) { teardown(); setStatus('idle'); }
    };
  }, [handleEvent, teardown]);

  // ── OpenAI / Azure OpenAI WebRTC path ───────────────────────────────────────

  const connectWebRtc = useCallback(async () => {
    const res = await fetch('/api/realtime/session', { method: 'POST' });
    const body = (await res.json()) as SessionResponse;
    if (!res.ok || !body?.client_secret?.value) {
      throw new Error(body?.error ?? body?.detail ?? `Session request failed (${res.status})`);
    }
    const token = body.client_secret.value;
    const model = body.model ?? 'gpt-4o-realtime-preview-2024-12-17';
    const baseUrl = body.base_url ?? 'https://api.openai.com/v1/realtime';

    let mic: MediaStream;
    try {
      mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = mic;
    } catch (err) {
      const name = err instanceof Error ? err.name : '';
      throw new Error(name === 'NotAllowedError' ? 'Microphone permission denied.' : `Microphone error: ${String(err)}`);
    }

    const pc = new RTCPeerConnection();
    pcRef.current = pc;

    pc.ontrack = (event) => {
      if (audioElRef.current && event.streams[0]) {
        audioElRef.current.srcObject = event.streams[0];
        void audioElRef.current.play().catch(() => { /* autoplay deferred */ });
      }
    };

    mic.getTracks().forEach((track) => pc.addTrack(track, mic));

    const channel = pc.createDataChannel('oai-events');
    dataChannelRef.current = channel;
    channel.addEventListener('open', () => {
      channel.send(JSON.stringify({ type: 'session.update', session: { input_audio_transcription: { model: 'whisper-1' } } }));
    });
    channel.addEventListener('message', (event) => {
      if (typeof event.data === 'string') handleEvent(event.data);
    });

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') setStatus('live');
      else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        setStatus((prev) => (prev === 'ending' ? 'idle' : 'error'));
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const sdpRes = await fetch(`${baseUrl}?model=${encodeURIComponent(model)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/sdp' },
      body: offer.sdp ?? '',
    });
    if (!sdpRes.ok) {
      const detail = await sdpRes.text().catch(() => '');
      throw new Error(`Realtime handshake failed (${sdpRes.status}): ${detail.slice(0, 200)}`);
    }
    await pc.setRemoteDescription({ type: 'answer', sdp: await sdpRes.text() });
  }, [handleEvent]);

  // ── Start / end call ────────────────────────────────────────────────────────

  const startCall = useCallback(async () => {
    setError('');
    setTranscript([]);
    setStatus('connecting');
    try {
      if (mode === 'azure-ws') {
        await connectAzureWs();
      } else {
        await connectWebRtc();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
      teardown();
    }
  }, [mode, connectAzureWs, connectWebRtc, teardown]);

  const endCall = useCallback(() => {
    setStatus('ending');
    teardown();
    setStatus('idle');
  }, [teardown]);

  // ── Render ──────────────────────────────────────────────────────────────────

  const live = status === 'live';
  const connecting = status === 'connecting';
  const agentLabel = mode === 'azure-ws' ? 'Live Agent' : '6 God';

  return (
    <Card>
      <CardTitle>Hotline Bling</CardTitle>
      <div className="mt-3 space-y-3 text-sm text-slate-200">

        {status === 'checking' && (
          <span className="text-xs text-slate-400">Checking configuration…</span>
        )}

        {status === 'unconfigured' && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--ice-text3)', lineHeight: 1.7 }}>
            <p style={{ margin: '0 0 5px', color: '#b04040', fontWeight: 600 }}>Realtime not configured.</p>
            <p style={{ margin: 0, opacity: 0.85 }}>
              Set <code>OPENAI_API_KEY</code> for OpenAI direct, or{' '}
              <code>AZURE_OPENAI_REALTIME_ENDPOINT</code> + <code>AZURE_OPENAI_REALTIME_KEY</code> +{' '}
              <code>AZURE_OPENAI_REALTIME_DEPLOYMENT</code> for Azure OpenAI.
            </p>
          </div>
        )}

        {status !== 'checking' && status !== 'unconfigured' && (
          <>
            <div className="flex items-center gap-3 flex-wrap">
              {!live && !connecting && (
                <Button onClick={startCall} variant="default">
                  <Phone className="w-4 h-4 mr-1.5" /> Call {agentLabel}
                </Button>
              )}
              {connecting && (
                <Button disabled variant="outline">
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Connecting…
                </Button>
              )}
              {live && (
                <Button onClick={endCall} variant="outline">
                  <PhoneOff className="w-4 h-4 mr-1.5" /> End call
                </Button>
              )}
              <span className="text-xs text-slate-400">
                {status === 'idle' && 'Ready to connect'}
                {status === 'connecting' && 'Opening line…'}
                {status === 'live' && 'Live — speak freely'}
                {status === 'ending' && 'Hanging up…'}
                {status === 'error' && 'Connection error'}
              </span>
              {error && <span className="text-xs text-rose-400">{error}</span>}
            </div>

            {status === 'error' && error.toLowerCase().includes('permission') && (
              <p className="text-xs text-amber-400 rounded-md border border-amber-800/40 bg-amber-900/20 px-3 py-2">
                Microphone access was denied. Allow the mic for this site in browser settings, then try again.
              </p>
            )}

            <div className="min-h-[64px] max-h-[180px] overflow-y-auto rounded-md border border-border bg-panel px-3 py-2 text-xs text-slate-100 space-y-1.5">
              {transcript.length === 0 ? (
                <span className="text-slate-400">Live transcript will appear here once the call is connected.</span>
              ) : (
                transcript.map((line, i) => (
                  <div key={i} className="leading-snug">
                    <span
                      className="mr-1.5 text-[10px] font-semibold uppercase tracking-wide"
                      style={{ color: line.role === 'user' ? '#40c8f0' : '#b8902a' }}
                    >
                      {line.role === 'user' ? 'You' : agentLabel}
                    </span>
                    <span>{line.text}</span>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        <audio ref={audioElRef} autoPlay hidden />
      </div>
    </Card>
  );
}
