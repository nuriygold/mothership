'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChatTabs } from '@/components/ui/chat-tabs';

const TerminalView = dynamic(() => import('./terminal-view'), {
  ssr: false,
  loading: () => <div style={{ flex: 1, background: '#0b0f17' }} />,
});

const PROVIDERS = {
  anthropic: {
    name: 'Anthropic',
    models: [
      { id: 'claude-opus-4-7', label: 'Opus 4.7' },
      { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
      { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },
    ],
  },
  openai: {
    name: 'OpenAI',
    models: [
      { id: 'gpt-4o', label: 'GPT-4o' },
      { id: 'gpt-4o-mini', label: 'GPT-4o Mini' },
      { id: 'o3-mini', label: 'o3-mini' },
    ],
  },
  groq: {
    name: 'Groq',
    models: [
      { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B' },
      { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B' },
      { id: 'gemma2-9b-it', label: 'Gemma 2 9B' },
    ],
  },
  together: {
    name: 'Together',
    models: [
      { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', label: 'Llama 3.3 70B' },
      { id: 'mistralai/Mixtral-8x7B-Instruct-v0.1', label: 'Mixtral 8x7B' },
      { id: 'Qwen/Qwen2.5-72B-Instruct-Turbo', label: 'Qwen 2.5 72B' },
    ],
  },
  azure: {
    name: 'Azure OpenAI',
    models: [],
  },
} as const;

type Provider = keyof typeof PROVIDERS;
type Mode = 'chat' | 'terminal' | 'live';
type Message = { role: 'user' | 'assistant'; content: string };

type Config = {
  provider: Provider;
  model: string;
  keys: Partial<Record<Provider, string>>;
  terminalUrl: string;
  azureEndpoint: string;
};

const DEFAULTS: Config = {
  provider: 'azure',
  model: 'gpt-5.3-codex',
  keys: {},
  terminalUrl: 'ws://localhost:3001',
  azureEndpoint: '',
};

const CFG_KEY = 'claude-page-config';

function loadCfg(): Config {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const raw = JSON.parse(localStorage.getItem(CFG_KEY) ?? '{}');
    return { ...DEFAULTS, ...raw, keys: { ...DEFAULTS.keys, ...raw?.keys } };
  } catch { return DEFAULTS; }
}

function saveCfg(c: Config) {
  if (typeof window !== 'undefined') localStorage.setItem(CFG_KEY, JSON.stringify(c));
}

const sel: React.CSSProperties = {
  background: '#151826',
  border: '1px solid #2a2f45',
  borderRadius: 6,
  color: 'white',
  padding: '5px 8px',
  fontSize: 13,
  cursor: 'pointer',
};

export default function ClaudePage() {
  const [mode, setMode] = useState<Mode>('chat');
  const [cfg, setCfg] = useState<Config>(DEFAULTS);
  const [showKey, setShowKey] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messagesBySession, setMessagesBySession] = useState<Record<string, Message[]>>({});
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [liveStatus, setLiveStatus] = useState<'idle' | 'recording' | 'thinking' | 'speaking'>('idle');
  const [liveTranscript, setLiveTranscript] = useState('');
  const [liveResponse, setLiveResponse] = useState('');
  const messagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const liveAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => { setCfg(loadCfg()); }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sid = params.get('session');
    if (sid?.startsWith('agent:claude:')) setSessionId(sid);
  }, []);

  const messages = sessionId ? (messagesBySession[sessionId] ?? []) : [];

  useEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  function patchCfg(patch: Partial<Config>) {
    setCfg((prev) => {
      const next = { ...prev, ...patch };
      saveCfg(next);
      return next;
    });
  }

  function setProvider(p: Provider) {
    const models = PROVIDERS[p].models as readonly { id: string }[];
    const model = models.length > 0 ? models[0].id : '';
    patchCfg({ provider: p, model });
  }

  function setKey(val: string) {
    setCfg((prev) => {
      const next = { ...prev, keys: { ...prev.keys, [prev.provider]: val } };
      saveCfg(next);
      return next;
    });
  }

  const handleSessionChange = useCallback((sid: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('session', sid);
    window.history.replaceState({}, '', url.toString());
    setSessionId(sid);
    setInput('');
    setError(null);
    setLoading(false);
    inputRef.current?.focus();
  }, []);

  const handleSessionClose = useCallback((sid: string) => {
    setMessagesBySession((prev) => {
      if (!(sid in prev)) return prev;
      const next = { ...prev };
      delete next[sid];
      return next;
    });
  }, []);

  async function startMicRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.start();
      mediaRecorderRef.current = recorder;
    } catch {}
  }

  async function stopMicAndTranscribe(): Promise<string> {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') return '';
    return new Promise((resolve) => {
      recorder.onstop = async () => {
        recorder.stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        if (blob.size < 1000) { resolve(''); return; }
        try {
          const res = await fetch('/api/voice/stt', {
            method: 'POST',
            headers: { 'Content-Type': recorder.mimeType || 'audio/webm' },
            body: blob,
          });
          const data = await res.json();
          resolve((data.text ?? '').trim());
        } catch { resolve(''); }
      };
      recorder.stop();
    });
  }

  async function playTts(text: string) {
    try {
      const res = await fetch('/api/voice/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) return;
      const buf = await res.arrayBuffer();
      const blob = new Blob([buf], { type: 'audio/mpeg' });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      liveAudioRef.current = audio;
      await new Promise<void>((resolve) => {
        audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
        audio.onerror = () => { URL.revokeObjectURL(url); resolve(); };
        audio.play().catch(() => resolve());
      });
    } catch {}
  }

  async function handleChatMicDown(e: React.PointerEvent) {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setRecording(true);
    await startMicRecording();
  }

  async function handleChatMicUp() {
    if (!recording) return;
    setRecording(false);
    setTranscribing(true);
    const text = await stopMicAndTranscribe();
    setTranscribing(false);
    if (text) setInput(text);
  }

  async function handleLiveMicDown(e: React.PointerEvent) {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    if (liveStatus !== 'idle') return;
    liveAudioRef.current?.pause();
    setLiveStatus('recording');
    setLiveTranscript('');
    setLiveResponse('');
    await startMicRecording();
  }

  async function handleLiveMicUp() {
    if (liveStatus !== 'recording') return;
    setLiveStatus('thinking');
    const text = await stopMicAndTranscribe();
    if (!text) { setLiveStatus('idle'); return; }
    setLiveTranscript(text);

    const activeSession = sessionId;
    if (!activeSession) { setLiveStatus('idle'); return; }

    const prev = messagesBySession[activeSession] ?? [];
    const withUser: Message[] = [...prev, { role: 'user', content: text }];
    setMessagesBySession((m) => ({ ...m, [activeSession]: withUser }));

    let fullResponse = '';
    try {
      const res = await fetch('/api/claude/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: cfg.provider,
          model: cfg.model,
          apiKey: cfg.keys[cfg.provider] ?? '',
          messages: withUser,
          azureEndpoint: cfg.azureEndpoint,
        }),
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';

      outer: while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const raw = line.slice(5).trim();
          if (raw === '[DONE]') break outer;
          try {
            const evt = JSON.parse(raw);
            if (evt.delta) { fullResponse += evt.delta; setLiveResponse(fullResponse); }
          } catch {}
        }
      }

      const withAssistant: Message[] = [...withUser, { role: 'assistant', content: fullResponse }];
      setMessagesBySession((m) => ({ ...m, [activeSession]: withAssistant }));

      if (fullResponse) {
        setLiveStatus('speaking');
        await playTts(fullResponse);
      }
    } catch {}
    setLiveStatus('idle');
  }

  async function send() {
    const text = input.trim();
    const activeSession = sessionId;
    if (!text || loading || !activeSession) return;

    const apiKey = cfg.keys[cfg.provider] ?? '';
    if (!apiKey && cfg.provider !== 'azure') {
      setError(`No API key set for ${PROVIDERS[cfg.provider].name}. Add it in the config bar above.`);
      return;
    }

    const prev = messagesBySession[activeSession] ?? [];
    const withUser: Message[] = [...prev, { role: 'user', content: text }];
    setInput('');
    setError(null);
    setLoading(true);
    setMessagesBySession((m) => ({ ...m, [activeSession]: withUser }));

    try {
      const res = await fetch('/api/claude/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: cfg.provider, model: cfg.model, apiKey, messages: withUser, azureEndpoint: cfg.azureEndpoint }),
      });

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let accumulated = '';
      let added = false;

      outer: while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const raw = line.slice(5).trim();
          if (raw === '[DONE]') break outer;
          try {
            const evt = JSON.parse(raw);
            if (evt.error) { setError(evt.error); break outer; }
            if (evt.delta) {
              accumulated += evt.delta;
              const asst: Message = { role: 'assistant', content: accumulated };
              setMessagesBySession((m) => {
                const cur = m[activeSession] ?? [];
                return {
                  ...m,
                  [activeSession]: added ? [...cur.slice(0, -1), asst] : [...cur, asst],
                };
              });
              added = true;
            }
          } catch {}
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  const currentModels = PROVIDERS[cfg.provider].models;
  const currentKey = cfg.keys[cfg.provider] ?? '';

  return (
    <div style={{ background: '#0b0f17', minHeight: '100vh', width: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        height: 56,
        display: 'flex',
        alignItems: 'center',
        padding: '0 20px',
        gap: 12,
        background: 'rgba(20,25,35,0.95)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid #1e2235',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 18, color: 'white', fontWeight: 600, letterSpacing: 1 }}>
          CLAUDE
        </span>
        <div style={{ flex: 1 }} />
        {/* Mode toggle */}
        <div style={{ display: 'flex', border: '1px solid #2a2f45', borderRadius: 8, overflow: 'hidden' }}>
          {(['chat', 'live', 'terminal'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                background: mode === m ? 'rgba(56,184,218,0.15)' : 'transparent',
                color: mode === m ? '#38b8da' : 'rgba(255,255,255,0.4)',
                border: 'none',
                borderRight: m !== 'terminal' ? '1px solid #2a2f45' : 'none',
                padding: '5px 14px',
                fontSize: 13,
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Config bar */}
      <div style={{
        padding: '8px 16px',
        background: 'rgba(15,19,28,0.9)',
        borderBottom: '1px solid #1e2235',
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        alignItems: 'center',
        flexShrink: 0,
      }}>
        {/* Provider */}
        <select
          value={cfg.provider}
          onChange={(e) => setProvider(e.target.value as Provider)}
          style={sel}
        >
          {(Object.keys(PROVIDERS) as Provider[]).map((p) => (
            <option key={p} value={p}>{PROVIDERS[p].name}</option>
          ))}
        </select>

        {/* Model — text input for Azure (deployment name), dropdown for others */}
        {cfg.provider === 'azure' ? (
          <input
            type="text"
            value={cfg.model}
            onChange={(e) => patchCfg({ model: e.target.value })}
            placeholder="Deployment name"
            style={{ ...sel, width: 180, fontSize: 12 }}
          />
        ) : (
          <select
            value={cfg.model}
            onChange={(e) => patchCfg({ model: e.target.value })}
            style={sel}
          >
            {(currentModels as readonly { id: string; label: string }[]).map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        )}

        {/* Azure endpoint */}
        {cfg.provider === 'azure' && (
          <input
            type="text"
            value={cfg.azureEndpoint}
            onChange={(e) => patchCfg({ azureEndpoint: e.target.value })}
            placeholder="https://your-resource.openai.azure.com"
            style={{ ...sel, width: 300, fontSize: 12, fontFamily: 'monospace' }}
          />
        )}

        {/* API Key */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, flex: 1, minWidth: 200 }}>
          <input
            type={showKey ? 'text' : 'password'}
            value={currentKey}
            onChange={(e) => setKey(e.target.value)}
            placeholder={`${PROVIDERS[cfg.provider].name} API key`}
            style={{
              ...sel,
              borderRadius: '6px 0 0 6px',
              flex: 1,
              fontFamily: showKey ? 'monospace' : 'inherit',
              fontSize: 12,
            }}
          />
          <button
            onClick={() => setShowKey((s) => !s)}
            style={{
              background: '#1a1f30',
              border: '1px solid #2a2f45',
              borderLeft: 'none',
              borderRadius: '0 6px 6px 0',
              color: 'rgba(255,255,255,0.4)',
              padding: '5px 8px',
              cursor: 'pointer',
              fontSize: 13,
            }}
            title={showKey ? 'Hide key' : 'Show key'}
          >
            {showKey ? '○' : '●'}
          </button>
        </div>

        {/* Terminal config (only visible in terminal mode) */}
        {mode === 'terminal' && (
          <>
            <input
              type="text"
              value={cfg.terminalUrl}
              onChange={(e) => patchCfg({ terminalUrl: e.target.value })}
              placeholder="ws://localhost:3001"
              style={{ ...sel, width: 240, fontSize: 12, fontFamily: 'monospace' }}
            />
          </>
        )}
      </div>

      {/* Chat tabs (chat mode only) */}
      {mode === 'chat' && (
        <div style={{ padding: '8px 16px', borderBottom: '1px solid #1e2235', background: 'rgba(15,19,28,0.7)', flexShrink: 0 }}>
          <ChatTabs
            agent="claude"
            sessionId={sessionId}
            onSessionChange={handleSessionChange}
            onSessionClose={handleSessionClose}
          />
        </div>
      )}

      {/* Main content */}
      {mode === 'live' ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, padding: '40px 24px', color: 'white' }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: 3, textTransform: 'uppercase', fontFamily: 'monospace' }}>
            {liveStatus === 'idle' && (sessionId ? 'Ready' : 'Open a chat tab first')}
            {liveStatus === 'recording' && '● Recording'}
            {liveStatus === 'thinking' && '⟳ Thinking'}
            {liveStatus === 'speaking' && '♪ Speaking'}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 520 }}>
            {liveTranscript && (
              <div style={{ padding: '11px 15px', background: '#38b8da', borderRadius: '12px 12px 2px 12px', fontSize: 14, lineHeight: 1.5, alignSelf: 'flex-end', maxWidth: '88%' }}>
                {liveTranscript}
              </div>
            )}
            {liveResponse && (
              <div style={{ padding: '11px 15px', background: '#1a1f30', border: '1px solid #2a2f45', borderRadius: '12px 12px 12px 2px', fontSize: 14, lineHeight: 1.55, alignSelf: 'flex-start', maxWidth: '88%' }}>
                <div className="md-body">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{liveResponse}</ReactMarkdown>
                </div>
              </div>
            )}
          </div>

          <button
            onPointerDown={handleLiveMicDown}
            onPointerUp={handleLiveMicUp}
            onPointerLeave={handleLiveMicUp}
            disabled={liveStatus === 'thinking' || liveStatus === 'speaking' || !sessionId}
            style={{
              width: 76, height: 76,
              borderRadius: '50%',
              border: 'none',
              background: liveStatus === 'recording' ? 'rgba(255,68,68,0.85)' : liveStatus !== 'idle' ? '#2a2f45' : '#38b8da',
              color: 'white',
              fontSize: 30,
              cursor: liveStatus === 'idle' && sessionId ? 'pointer' : 'default',
              opacity: (liveStatus === 'thinking' || liveStatus === 'speaking' || !sessionId) ? 0.45 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: liveStatus === 'recording'
                ? '0 0 0 10px rgba(255,68,68,0.15), 0 0 28px rgba(255,68,68,0.35)'
                : liveStatus === 'idle' && sessionId
                  ? '0 0 0 6px rgba(56,184,218,0.15)'
                  : 'none',
              transition: 'all 0.2s',
              userSelect: 'none',
              touchAction: 'none',
              marginTop: 16,
            }}
          >
            🎤
          </button>

          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.18)', fontFamily: 'monospace' }}>
            {liveStatus === 'idle' && sessionId ? 'hold to speak · release to send' : ''}
          </div>
        </div>
      ) : mode === 'terminal' ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <TerminalView
            serverUrl={cfg.terminalUrl}
            token=""
            sessionId={sessionId}
          />
        </div>
      ) : (
        <>
          {/* Messages */}
          <div
            ref={messagesRef}
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '20px 24px',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              color: 'white',
            }}
          >
            {messages.length === 0 && !loading && (
              <div style={{ opacity: 0.35, fontSize: 14, marginTop: 20 }}>
                Select a provider, set your API key, and start chatting.
              </div>
            )}

            {messages.map((m, i) => (
              <div
                key={i}
                style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}
              >
                <div style={{
                  maxWidth: '82%',
                  padding: '10px 14px',
                  borderRadius: m.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                  background: m.role === 'user' ? '#38b8da' : '#1a1f30',
                  fontSize: 14,
                  lineHeight: 1.55,
                }}>
                  {m.role === 'user' ? (
                    <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.content}</span>
                  ) : (
                    <div className="md-body">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div style={{ display: 'flex' }}>
                <div style={{ padding: '10px 14px', borderRadius: '12px 12px 12px 2px', background: '#1a1f30', fontSize: 14 }}>
                  <span style={{ animation: 'pulse 1.2s ease-in-out infinite', opacity: 0.5 }}>●</span>{' '}
                  <span style={{ animation: 'pulse 1.2s ease-in-out 0.2s infinite', opacity: 0.5 }}>●</span>{' '}
                  <span style={{ animation: 'pulse 1.2s ease-in-out 0.4s infinite', opacity: 0.5 }}>●</span>
                </div>
              </div>
            )}

            {error && (
              <div style={{
                padding: '10px 14px', borderRadius: 8,
                background: 'rgba(255,80,80,0.08)', border: '1px solid rgba(255,80,80,0.25)',
                color: '#ff7070', fontSize: 13,
              }}>
                {error}
              </div>
            )}
          </div>

          {/* Input */}
          <div style={{
            padding: '12px 20px',
            borderTop: '1px solid #1e2235',
            background: 'rgba(20,25,35,0.95)',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
                }}
                disabled={loading || !sessionId}
                rows={1}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  border: '1px solid #2a2f45',
                  borderRadius: 8,
                  background: '#151826',
                  color: 'white',
                  fontSize: 14,
                  outline: 'none',
                  resize: 'none',
                  lineHeight: 1.5,
                  maxHeight: 160,
                  overflowY: 'auto',
                  fontFamily: 'inherit',
                }}
                placeholder={`Message ${PROVIDERS[cfg.provider].name}…`}
                autoFocus
                onInput={(e) => {
                  const t = e.currentTarget;
                  t.style.height = 'auto';
                  t.style.height = `${Math.min(t.scrollHeight, 160)}px`;
                }}
              />
              <button
                onPointerDown={handleChatMicDown}
                onPointerUp={handleChatMicUp}
                onPointerLeave={handleChatMicUp}
                disabled={(loading || transcribing) && !recording}
                title="Hold to speak"
                style={{
                  background: recording ? 'rgba(255,68,68,0.15)' : 'transparent',
                  color: recording ? '#ff6b6b' : transcribing ? '#fbbf24' : 'rgba(255,255,255,0.35)',
                  border: 'none',
                  borderRadius: 8,
                  padding: '10px 10px',
                  cursor: 'pointer',
                  fontSize: 16,
                  flexShrink: 0,
                  userSelect: 'none',
                  touchAction: 'none',
                }}
              >
                🎤
              </button>
              <button
                onClick={send}
                disabled={loading || !input.trim() || !sessionId}
                style={{
                  background: loading ? '#2a2f45' : '#38b8da',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  padding: '10px 18px',
                  fontSize: 14,
                  cursor: loading || !input.trim() || !sessionId ? 'default' : 'pointer',
                  opacity: !input.trim() || !sessionId ? 0.45 : 1,
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                {loading ? '…' : 'Send'}
              </button>
            </div>
            <div style={{ marginTop: 4, fontSize: 11, color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace' }}>
              {sessionId ?? ''} · {cfg.provider} / {cfg.model}
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes pulse { 0%,100%{opacity:.25} 50%{opacity:1} }
        .md-body { font-size: 14px; line-height: 1.6; word-break: break-word; }
        .md-body p { margin: 0 0 10px; }
        .md-body p:last-child { margin: 0; }
        .md-body code { background: rgba(255,255,255,0.08); padding: 1px 5px; border-radius: 3px; font-family: "IBM Plex Mono",monospace; font-size: 12.5px; }
        .md-body pre { background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; padding: 12px 14px; overflow-x: auto; margin: 8px 0; }
        .md-body pre code { background: none; padding: 0; }
        .md-body ul,.md-body ol { padding-left: 20px; margin: 6px 0; }
        .md-body li { margin: 3px 0; }
        .md-body h1,.md-body h2,.md-body h3 { margin: 12px 0 6px; font-weight: 600; }
        .md-body blockquote { border-left: 3px solid #38b8da; margin: 0; padding: 2px 0 2px 12px; color: rgba(255,255,255,0.65); }
        .md-body a { color: #38b8da; text-decoration: none; }
        .md-body a:hover { text-decoration: underline; }
        .md-body table { border-collapse: collapse; width: 100%; margin: 8px 0; }
        .md-body th,.md-body td { border: 1px solid rgba(255,255,255,0.12); padding: 5px 10px; text-align: left; font-size: 13px; }
        .md-body th { background: rgba(255,255,255,0.05); }
        .md-body hr { border: none; border-top: 1px solid rgba(255,255,255,0.12); margin: 12px 0; }
      `}</style>
    </div>
  );
}
