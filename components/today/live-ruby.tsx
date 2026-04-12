'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Send, Mic } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Message = {
  id: string;
  role: 'user' | 'bot';
  text: string;
  streaming?: boolean;
  ts: Date;
};

const RUBY_QUICK_PROMPTS = [
  'Draft a follow-up email',
  'Write a cold outreach',
  'Rewrite this more clearly',
  'Summarize my blockers',
  'Help me respond to this',
  'Make this more direct',
];

const SLASH_COMMANDS: Record<string, string> = {
  '/summary': 'Summarize our conversation so far in bullet points.',
  '/todo':    'Extract all action items from our conversation as a numbered list.',
  '/eli5':    "Explain the last response in very simple terms, like I'm 5.",
  '/short':   'Give an ultra-concise, one-sentence answer to my last question.',
  '/deep':    'Give a detailed, comprehensive explanation of the last topic.',
};

const BUTTERFLY_STYLE = `
@keyframes ruby-butterfly-fly {
  0%   { transform: translate(0,0) scale(1) rotate(0deg); opacity: 1; }
  60%  { transform: translate(60px,-60px) scale(1.4) rotate(20deg); opacity: 0.8; }
  100% { transform: translate(120px,-120px) scale(0) rotate(45deg); opacity: 0; }
}
@keyframes ruby-send-exit {
  0%   { transform: translate(0,0) scale(1); opacity: 1; }
  100% { transform: translate(80%,-80%) scale(0); opacity: 0; }
}
.ruby-butterfly-fly { animation: ruby-butterfly-fly 0.65s ease-out forwards; }
.ruby-send-exit     { animation: ruby-send-exit 0.3s ease-in forwards; }
`;

const MARKDOWN_STYLE = `
.ruby-markdown { font-size: 0.875rem; line-height: 1.6; color: inherit; }
.ruby-markdown p { margin: 0 0 0.4em 0; }
.ruby-markdown p:last-child { margin-bottom: 0; }
.ruby-markdown ul { list-style: disc; padding-left: 1.2em; margin: 0.3em 0; }
.ruby-markdown ol { list-style: decimal; padding-left: 1.2em; margin: 0.3em 0; }
.ruby-markdown li { margin-bottom: 0.15em; }
.ruby-markdown strong { font-weight: 600; color: #be185d; }
.ruby-markdown h1, .ruby-markdown h2, .ruby-markdown h3 { font-weight: 600; margin: 0.5em 0 0.25em 0; line-height: 1.3; }
.ruby-markdown h1 { font-size: 1em; }
.ruby-markdown h2 { font-size: 0.95em; }
.ruby-markdown h3 { font-size: 0.9em; }
.ruby-markdown code { font-family: ui-monospace, monospace; font-size: 0.8em; background: rgba(190,24,93,0.08); border-radius: 3px; padding: 0.1em 0.3em; }
.ruby-markdown pre { background: rgba(190,24,93,0.06); border: 1px solid rgba(190,24,93,0.15); border-radius: 6px; padding: 0.6em 0.8em; overflow-x: auto; margin: 0.4em 0; }
.ruby-markdown pre code { background: none; padding: 0; }
.ruby-markdown blockquote { border-left: 3px solid #f9a8d4; padding-left: 0.6em; color: var(--muted-foreground); margin: 0.4em 0; }
.ruby-markdown a { color: #be185d; text-decoration: underline; }
`;

export function LiveRuby({
  prefill,
  onPrefillConsumed,
}: {
  prefill?: string;
  onPrefillConsumed?: () => void;
} = {}) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'bot',
      text: "Hey, I'm Ruby. What are we writing or communicating today?",
      ts: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [butterfly, setButterfly] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Inject keyframes and markdown styles once
  useEffect(() => {
    if (!document.getElementById('ruby-butterfly-style')) {
      const s = document.createElement('style');
      s.id = 'ruby-butterfly-style';
      s.textContent = BUTTERFLY_STYLE;
      document.head.appendChild(s);
    }
    if (!document.getElementById('ruby-markdown-style')) {
      const s = document.createElement('style');
      s.id = 'ruby-markdown-style';
      s.textContent = MARKDOWN_STYLE;
      document.head.appendChild(s);
    }
  }, []);

  // Load or create stable sessionId from localStorage (SSR-safe)
  useEffect(() => {
    const KEY = 'ruby-session-id';
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(KEY, id);
    }
    setSessionId(id);
  }, []);

  // Load chat history from DB once sessionId is available
  useEffect(() => {
    if (!sessionId) return;
    fetch(`/api/v2/ruby/messages?sessionId=${sessionId}`)
      .then((r) => r.json())
      .then((data) => {
        const dbMessages: Array<{ id: string; role: string; content: string; createdAt: string }> =
          data?.messages ?? [];
        if (dbMessages.length === 0) return; // keep welcome message
        setMessages(
          dbMessages.map((m) => ({
            id: m.id,
            role: m.role === 'assistant' ? 'bot' : 'user',
            text: m.content,
            ts: new Date(m.createdAt),
          }))
        );
      })
      .catch(() => {}); // silently ignore — welcome message stays
  }, [sessionId]);

  // Pre-fill from Gateway button
  useEffect(() => {
    if (prefill && prefill.trim()) {
      setInput(prefill);
      onPrefillConsumed?.();
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [prefill, onPrefillConsumed]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    // Expand slash commands to their full prompts
    const apiText = SLASH_COMMANDS[trimmed.toLowerCase()] ?? trimmed;

    setButterfly(true);
    setTimeout(() => setButterfly(false), 700);

    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', text: trimmed, ts: new Date() };
    const botId = `b-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      userMsg,
      { id: botId, role: 'bot', text: '', streaming: true, ts: new Date() },
    ]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/v2/ruby/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: apiText, sessionId }),
      });

      if (!res.ok || !res.body) throw new Error(`Ruby ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let accumulated = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith('data:')) continue;
          const ds = t.slice(5).trim();
          if (ds === '[DONE]') break;
          try {
            const evt = JSON.parse(ds);
            if (evt.delta) {
              accumulated += evt.delta;
              const snap = accumulated;
              setMessages((prev) =>
                prev.map((m) => (m.id === botId ? { ...m, text: snap } : m))
              );
            } else if (evt.error) {
              accumulated = `⚠ ${evt.error}`;
              setMessages((prev) =>
                prev.map((m) => (m.id === botId ? { ...m, text: accumulated } : m))
              );
            }
          } catch (_) {}
        }
      }

      setMessages((prev) =>
        prev.map((m) => (m.id === botId ? { ...m, streaming: false } : m))
      );
    } catch (err) {
      const errText = err instanceof Error ? err.message : 'Unknown error';
      setMessages((prev) =>
        prev.map((m) =>
          m.id === botId ? { ...m, text: `⚠ ${errText}`, streaming: false } : m
        )
      );
    } finally {
      setLoading(false);
    }
  }, [loading, sessionId]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : '';
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
    } catch (_) {}
  }, []);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;

    recorder.onstop = async () => {
      recorder.stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
      if (blob.size < 1000) {
        setTranscribing(false);
        return;
      }
      try {
        const res = await fetch('/api/voice/stt', {
          method: 'POST',
          headers: { 'Content-Type': recorder.mimeType || 'audio/webm' },
          body: blob,
        });
        const data = await res.json();
        if (data.text?.trim()) {
          await send(data.text.trim());
        }
      } catch (_) {
      } finally {
        setTranscribing(false);
      }
    };

    recorder.stop();
    setRecording(false);
    setTranscribing(true);
  }, [send]);

  const handleMicPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      startRecording();
    },
    [startRecording]
  );

  const handleMicPointerUp = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      stopRecording();
    },
    [stopRecording]
  );

  const isBusy = loading || transcribing;

  return (
    <div
      className="rounded-3xl overflow-hidden flex flex-col"
      style={{ border: '1px solid var(--border)', background: 'var(--card)' }}
    >
      {/* Header — Ruby's pink gradient */}
      <div
        className="flex items-center gap-3 px-4 py-3"
        style={{
          background: 'linear-gradient(135deg, #fce7f3 0%, #fbcfe8 50%, #f9a8d4 100%)',
        }}
      >
        {/* Ruby avatar */}
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold flex-shrink-0"
          style={{ background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.9)', color: '#be185d' }}
        >
          R
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold" style={{ color: '#0F1B35' }}>Live Ruby</p>
          <p className="text-[11px]" style={{ color: '#9d174d' }}>Comms &amp; Writing • Direct line</p>
        </div>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-medium flex-shrink-0"
          style={{ background: 'rgba(190,24,93,0.12)', color: '#9d174d' }}
        >
          ● Live
        </span>
      </div>

      {/* Chat messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto scrollbar-hide px-4 py-3 space-y-2"
        style={{ maxHeight: '260px', minHeight: '120px' }}
      >
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role === 'bot' && (
              <div
                className="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 mr-1.5 mt-0.5"
                style={{ background: '#fbcfe8', color: '#be185d', border: '1px solid #f9a8d4' }}
              >
                R
              </div>
            )}
            <div
              className="rounded-2xl px-3 py-2 text-sm max-w-[80%] leading-relaxed"
              style={{
                background:
                  msg.role === 'user' ? '#be185d' : 'var(--input-background)',
                color: msg.role === 'user' ? '#FFFFFF' : 'var(--foreground)',
                border: msg.role === 'bot' ? '1px solid var(--border)' : 'none',
              }}
            >
              {msg.streaming && !msg.text ? (
                <span className="flex items-center gap-1 py-0.5">
                  <span
                    className="w-1.5 h-1.5 rounded-full animate-bounce"
                    style={{ background: '#f9a8d4', animationDelay: '0ms' }}
                  />
                  <span
                    className="w-1.5 h-1.5 rounded-full animate-bounce"
                    style={{ background: '#f9a8d4', animationDelay: '150ms' }}
                  />
                  <span
                    className="w-1.5 h-1.5 rounded-full animate-bounce"
                    style={{ background: '#f9a8d4', animationDelay: '300ms' }}
                  />
                </span>
              ) : msg.role === 'bot' ? (
                <div className="ruby-markdown">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {msg.text}
                  </ReactMarkdown>
                  {msg.streaming && (
                    <span
                      className="inline-block w-0.5 h-3.5 ml-0.5 align-middle animate-pulse"
                      style={{ background: '#f9a8d4' }}
                    />
                  )}
                </div>
              ) : (
                <>
                  {msg.text}
                  {msg.streaming && (
                    <span
                      className="inline-block w-0.5 h-3.5 ml-0.5 align-middle animate-pulse"
                      style={{ background: '#f9a8d4' }}
                    />
                  )}
                </>
              )}
            </div>
          </div>
        ))}

        {transcribing && (
          <div className="flex justify-start">
            <div
              className="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 mr-1.5 mt-0.5"
              style={{ background: '#fbcfe8', color: '#be185d', border: '1px solid #f9a8d4' }}
            >
              R
            </div>
            <div
              className="rounded-2xl px-3 py-2 text-[11px]"
              style={{
                background: 'var(--input-background)',
                border: '1px solid var(--border)',
                color: 'var(--muted-foreground)',
              }}
            >
              Transcribing…
            </div>
          </div>
        )}
      </div>

      {/* Quick prompts */}
      <div className="px-4 pb-2 flex flex-wrap gap-1.5">
        {RUBY_QUICK_PROMPTS.map((p) => (
          <button
            key={p}
            onClick={() => send(p)}
            disabled={isBusy}
            className="rounded-full px-2.5 py-1 text-[11px] transition-opacity hover:opacity-80 disabled:opacity-40"
            style={{
              background: '#fce7f3',
              color: '#9d174d',
              border: '1px solid #fbcfe8',
            }}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Input row */}
      <div className="px-4 pb-4 flex gap-2">
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send(input)}
          placeholder={
            recording ? 'Listening…' : transcribing ? 'Transcribing…' : 'Ask Ruby anything… (try /summary)'
          }
          disabled={isBusy}
          className="flex-1 rounded-2xl px-3 py-2 text-sm outline-none transition-all"
          style={{
            background: 'var(--input-background)',
            border: `1px solid ${recording ? '#f9a8d4' : 'var(--border)'}`,
            color: 'var(--foreground)',
          }}
        />

        {/* Push-to-talk mic */}
        <button
          onPointerDown={handleMicPointerDown}
          onPointerUp={handleMicPointerUp}
          onPointerLeave={handleMicPointerUp}
          disabled={isBusy && !recording}
          className="w-9 h-9 flex items-center justify-center rounded-2xl flex-shrink-0 transition-all disabled:opacity-40 select-none touch-none"
          style={{
            background: recording ? '#f9a8d4' : 'var(--muted)',
            boxShadow: recording ? '0 0 12px rgba(249,168,212,0.6)' : 'none',
          }}
          title="Hold to speak"
        >
          <Mic
            className="w-4 h-4"
            style={{ color: recording ? '#9d174d' : 'var(--muted-foreground)' }}
          />
        </button>

        {/* Send button */}
        <button
          onClick={() => send(input)}
          disabled={!input.trim() || isBusy}
          className="w-9 h-9 flex items-center justify-center rounded-2xl flex-shrink-0 disabled:opacity-40 overflow-hidden relative"
          style={{ background: '#be185d' }}
        >
          <Send
            className={`w-4 h-4 text-white absolute ${butterfly ? 'ruby-send-exit' : ''}`}
            style={butterfly ? {} : { transition: 'none' }}
          />
          {butterfly && (
            <span className="absolute text-base ruby-butterfly-fly" style={{ lineHeight: 1 }}>
              🦋
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
