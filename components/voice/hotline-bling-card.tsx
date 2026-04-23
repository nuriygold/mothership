'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Phone, PhoneOff, Loader2 } from 'lucide-react';
import { Card, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type CallStatus = 'idle' | 'connecting' | 'live' | 'ending' | 'error';

type TranscriptLine = { role: 'user' | 'assistant'; text: string };

interface EphemeralTokenResponse {
  client_secret?: { value?: string; expires_at?: number };
  model?: string;
  error?: string;
  detail?: string;
}

const REALTIME_BASE = 'https://api.openai.com/v1/realtime';

/**
 * Hotline Bling — real-time voice agent running the 6 God script.
 *
 * Mints an ephemeral OpenAI Realtime token from `/api/realtime/session`, opens
 * a WebRTC peer connection directly to OpenAI, streams mic audio up and
 * receives voice + transcript events down.
 */
export function HotlineBlingCard() {
  const [status, setStatus] = useState<CallStatus>('idle');
  const [error, setError] = useState<string>('');
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  // Buffer the current in-flight assistant utterance so delta events can append.
  const assistantBufferRef = useRef<string>('');
  const userBufferRef = useRef<string>('');

  const teardown = useCallback(() => {
    try { dataChannelRef.current?.close(); } catch { /**/ }
    dataChannelRef.current = null;
    try { pcRef.current?.close(); } catch { /**/ }
    pcRef.current = null;
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    if (audioElRef.current) {
      audioElRef.current.pause();
      audioElRef.current.srcObject = null;
    }
    assistantBufferRef.current = '';
    userBufferRef.current = '';
  }, []);

  useEffect(() => {
    return () => {
      teardown();
    };
  }, [teardown]);

  const handleServerEvent = useCallback((raw: string) => {
    let evt: { type?: string; delta?: string; transcript?: string };
    try {
      evt = JSON.parse(raw);
    } catch {
      return;
    }
    switch (evt.type) {
      case 'response.audio_transcript.delta': {
        if (typeof evt.delta === 'string') {
          assistantBufferRef.current += evt.delta;
          setTranscript((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === 'assistant') {
              next[next.length - 1] = { role: 'assistant', text: assistantBufferRef.current };
            } else {
              next.push({ role: 'assistant', text: assistantBufferRef.current });
            }
            return next;
          });
        }
        break;
      }
      case 'response.audio_transcript.done': {
        assistantBufferRef.current = '';
        break;
      }
      case 'conversation.item.input_audio_transcription.completed': {
        if (typeof evt.transcript === 'string' && evt.transcript.trim()) {
          const text = evt.transcript.trim();
          userBufferRef.current = '';
          setTranscript((prev) => [...prev, { role: 'user', text }]);
        }
        break;
      }
      default:
        break;
    }
  }, []);

  const startCall = useCallback(async () => {
    setError('');
    setTranscript([]);
    setStatus('connecting');

    let token: string;
    let model: string;
    try {
      const res = await fetch('/api/realtime/session', { method: 'POST' });
      const body = (await res.json()) as EphemeralTokenResponse;
      if (!res.ok || !body?.client_secret?.value) {
        throw new Error(body?.error ?? body?.detail ?? `Session request failed (${res.status})`);
      }
      token = body.client_secret.value;
      model = body.model ?? 'gpt-4o-realtime-preview-2024-12-17';
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
      return;
    }

    let mic: MediaStream;
    try {
      mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = mic;
    } catch (err) {
      const name = err instanceof Error ? err.name : '';
      const denied = name === 'NotAllowedError' || name === 'PermissionDeniedError';
      setError(denied ? 'Microphone permission denied.' : `Microphone error: ${String(err)}`);
      setStatus('error');
      return;
    }

    try {
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      // Remote audio — attach inbound track to the hidden <audio> element.
      pc.ontrack = (event) => {
        if (audioElRef.current && event.streams[0]) {
          audioElRef.current.srcObject = event.streams[0];
          void audioElRef.current.play().catch(() => { /* autoplay may defer */ });
        }
      };

      // Send mic.
      mic.getTracks().forEach((track) => pc.addTrack(track, mic));

      // Data channel for session updates + server events.
      const channel = pc.createDataChannel('oai-events');
      dataChannelRef.current = channel;
      channel.addEventListener('open', () => {
        // Request input-audio transcription so we can show what the user said.
        channel.send(
          JSON.stringify({
            type: 'session.update',
            session: {
              input_audio_transcription: { model: 'whisper-1' },
            },
          }),
        );
      });
      channel.addEventListener('message', (event) => {
        if (typeof event.data === 'string') handleServerEvent(event.data);
      });

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          setStatus('live');
        } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          setStatus((prev) => (prev === 'ending' ? 'idle' : 'error'));
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpRes = await fetch(`${REALTIME_BASE}?model=${encodeURIComponent(model)}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/sdp',
        },
        body: offer.sdp ?? '',
      });
      if (!sdpRes.ok) {
        const detail = await sdpRes.text().catch(() => '');
        throw new Error(`Realtime handshake failed (${sdpRes.status}): ${detail.slice(0, 200)}`);
      }
      const answerSdp = await sdpRes.text();
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
      teardown();
    }
  }, [handleServerEvent, teardown]);

  const endCall = useCallback(() => {
    setStatus('ending');
    teardown();
    setStatus('idle');
  }, [teardown]);

  const live = status === 'live';
  const connecting = status === 'connecting';

  return (
    <Card>
      <CardTitle>Hotline Bling</CardTitle>
      <div className="mt-3 space-y-3 text-sm text-slate-200">
        <div className="flex items-center gap-3 flex-wrap">
          {!live && !connecting && (
            <Button onClick={startCall} variant="default">
              <Phone className="w-4 h-4 mr-1.5" /> Call 6 God
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
            {status === 'error' && 'Error'}
          </span>
          {error && <span className="text-xs text-rose-400">{error}</span>}
        </div>

        {status === 'error' && error.includes('permission') && (
          <p className="text-xs text-amber-400 rounded-md border border-amber-800/40 bg-amber-900/20 px-3 py-2">
            Microphone access was denied. Check your browser settings and allow the mic for this site, then try again.
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
                  {line.role === 'user' ? 'You' : '6 God'}
                </span>
                <span>{line.text}</span>
              </div>
            ))
          )}
        </div>

        <audio ref={audioElRef} autoPlay hidden />
      </div>
    </Card>
  );
}
