'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Send, Mic, Plus, Trash2, MessageSquare, Pencil, Check, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Message = {
  id: string;
  role: 'user' | 'bot';
  text: string;
  streaming?: boolean;
  ts: Date;
};

type SessionMeta = {
  id: string;
  title: string | null;
  lastMessage: string | null;
  updatedAt: string;
};

const QUICK_PROMPTS = [
  'What can you help me with?',
  'Summarize this for me',
  'Help me write something',
  'Explain this concept',
  'Review my code',
  'Make a plan',
];

const SLASH_COMMANDS: Record<string, string> = {
  '/summary': 'Summarize our conversation so far in bullet points.',
  '/todo':    'Extract all action items from our conversation as a numbered list.',
  '/eli5':    "Explain the last response in very simple terms, like I'm 5.",
  '/short':   'Give an ultra-concise, one-sentence answer to my last question.',
  '/deep':    'Give a detailed, comprehensive explanation of the last topic.',
};

const SESSIONS_KEY = 'ruby-sessions-v2'; // localStorage key for session list
const ACTIVE_SESSION_KEY = 'ruby-active-session';

function loadLocalSessions(): SessionMeta[] {
  try {
    return JSON.parse(localStorage.getItem(SESSIONS_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function saveLocalSessions(sessions: SessionMeta[]) {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions.slice(0, 50)));
}

const MARKDOWN_STYLE = `
.ruby-md { font-size: 0.9375rem; line-height: 1.65; color: inherit; }
.ruby-md p { margin: 0 0 0.5em 0; }
.ruby-md p:last-child { margin-bottom: 0; }
.ruby-md ul { list-style: disc; padding-left: 1.4em; margin: 0.4em 0; }
.ruby-md ol { list-style: decimal; padding-left: 1.4em; margin: 0.4em 0; }
.ruby-md li { margin-bottom: 0.2em; }
.ruby-md strong { font-weight: 600; }
.ruby-md h1, .ruby-md h2, .ruby-md h3 { font-weight: 600; margin: 0.6em 0 0.3em 0; line-height: 1.3; }
.ruby-md h1 { font-size: 1.1em; }
.ruby-md h2 { font-size: 1em; }
.ruby-md h3 { font-size: 0.95em; }
.ruby-md code { font-family: ui-monospace, monospace; font-size: 0.83em; background: rgba(0,0,0,0.06); border-radius: 4px; padding: 0.15em 0.35em; }
.dark .ruby-md code { background: rgba(255,255,255,0.08); }
.ruby-md pre { background: rgba(0,0,0,0.05); border: 1px solid rgba(0,0,0,0.08); border-radius: 8px; padding: 0.75em 1em; overflow-x: auto; margin: 0.5em 0; }
.dark .ruby-md pre { background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.08); }
.ruby-md pre code { background: none; padding: 0; }
.ruby-md blockquote { border-left: 3px solid #f9a8d4; padding-left: 0.75em; color: var(--muted-foreground); margin: 0.5em 0; }
.ruby-md a { color: #be185d; text-decoration: underline; }
.ruby-md table { border-collapse: collapse; width: 100%; margin: 0.5em 0; font-size: 0.875em; }
.ruby-md th, .ruby-md td { border: 1px solid var(--border); padding: 0.4em 0.6em; text-align: left; }
.ruby-md th { background: rgba(190,24,93,0.06); font-weight: 600; }
`;

export function LiveRuby({
  prefill,
  onPrefillConsumed,
}: {
  prefill?: string;
  onPrefillConsumed?: () => void;
} = {}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [editingTitle, setEditingTitle] = useState<string | null>(null);
  const [editTitleValue, setEditTitleValue] = useState('');

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Inject styles once
  useEffect(() => {
    if (!document.getElementById('ruby-md-style')) {
      const s = document.createElement('style');
      s.id = 'ruby-md-style';
      s.textContent = MARKDOWN_STYLE;
      document.head.appendChild(s);
    }
  }, []);

  // Init: load sessions list from localStorage, restore active session
  useEffect(() => {
    const stored = loadLocalSessions();
    setSessions(stored);

    const activeId = localStorage.getItem(ACTIVE_SESSION_KEY);
    if (activeId && stored.find((s) => s.id === activeId)) {
      setSessionId(activeId);
    } else if (stored.length > 0) {
      setSessionId(stored[0].id);
    } else {
      startNewSession();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load messages whenever sessionId changes
  useEffect(() => {
    if (!sessionId) return;
    localStorage.setItem(ACTIVE_SESSION_KEY, sessionId);
    setMessages([]);

    fetch(`/api/v2/ruby/messages?sessionId=${sessionId}`)
      .then((r) => r.json())
      .then((data) => {
        const dbMessages: Array<{ id: string; role: string; content: string; createdAt: string }> =
          data?.messages ?? [];
        if (dbMessages.length === 0) {
          setMessages([
            {
              id: 'welcome',
              role: 'bot',
              text: "Hey, I'm Ruby. Ask me anything — writing, research, code, planning, or whatever's on your mind.",
              ts: new Date(),
            },
          ]);
          return;
        }
        setMessages(
          dbMessages.map((m) => ({
            id: m.id,
            role: m.role === 'assistant' ? 'bot' : 'user',
            text: m.content,
            ts: new Date(m.createdAt),
          }))
        );
      })
      .catch(() => {
        setMessages([
          {
            id: 'welcome',
            role: 'bot',
            text: "Hey, I'm Ruby. Ask me anything.",
            ts: new Date(),
          },
        ]);
      });
  }, [sessionId]);

  // Pre-fill from external source (e.g. gateway button)
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

  const startNewSession = useCallback(() => {
    const newId = crypto.randomUUID();
    const now = new Date().toISOString();
    const newSession: SessionMeta = {
      id: newId,
      title: null,
      lastMessage: null,
      updatedAt: now,
    };

    // Ensure ChatSession row exists on the server (fire-and-forget)
    fetch('/api/v2/ruby/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: newId }),
    }).catch(() => {});

    setSessions((prev) => {
      const updated = [newSession, ...prev];
      saveLocalSessions(updated);
      return updated;
    });
    setSessionId(newId);
  }, []);

  const switchSession = useCallback((id: string) => {
    setSessionId(id);
  }, []);

  const deleteSession = useCallback(
    (id: string) => {
      fetch(`/api/v2/ruby/sessions/${id}`, { method: 'DELETE' }).catch(() => {});
      setSessions((prev) => {
        const updated = prev.filter((s) => s.id !== id);
        saveLocalSessions(updated);
        return updated;
      });
      if (sessionId === id) {
        const remaining = sessions.filter((s) => s.id !== id);
        if (remaining.length > 0) {
          setSessionId(remaining[0].id);
        } else {
          startNewSession();
        }
      }
    },
    [sessionId, sessions, startNewSession]
  );

  const updateSessionTitle = useCallback((id: string, title: string) => {
    fetch(`/api/v2/ruby/sessions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    }).catch(() => {});
    setSessions((prev) => {
      const updated = prev.map((s) => (s.id === id ? { ...s, title } : s));
      saveLocalSessions(updated);
      return updated;
    });
  }, []);

  // Auto-generate title from first user message
  const maybeSetTitle = useCallback(
    (text: string) => {
      if (!sessionId) return;
      const session = sessions.find((s) => s.id === sessionId);
      if (session?.title) return; // already titled
      const title = text.slice(0, 60).replace(/\n/g, ' ');
      updateSessionTitle(sessionId, title);
    },
    [sessionId, sessions, updateSessionTitle]
  );

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      const apiText = SLASH_COMMANDS[trimmed.toLowerCase()] ?? trimmed;
      maybeSetTitle(trimmed);

      const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', text: trimmed, ts: new Date() };
      const botId = `b-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        userMsg,
        { id: botId, role: 'bot', text: '', streaming: true, ts: new Date() },
      ]);
      setInput('');
      setLoading(true);

      // Update local session preview
      if (sessionId) {
        setSessions((prev) => {
          const updated = prev.map((s) =>
            s.id === sessionId
              ? { ...s, lastMessage: trimmed.slice(0, 120), updatedAt: new Date().toISOString() }
              : s
          );
          const sorted = [
            updated.find((s) => s.id === sessionId)!,
            ...updated.filter((s) => s.id !== sessionId),
          ];
          saveLocalSessions(sorted);
          return sorted;
        });
      }

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
    },
    [loading, sessionId, maybeSetTitle]
  );

  // Voice recording
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
      if (blob.size < 1000) { setTranscribing(false); return; }
      try {
        const res = await fetch('/api/voice/stt', {
          method: 'POST',
          headers: { 'Content-Type': recorder.mimeType || 'audio/webm' },
          body: blob,
        });
        const data = await res.json();
        if (data.text?.trim()) await send(data.text.trim());
      } catch (_) {
      } finally {
        setTranscribing(false);
      }
    };
    recorder.stop();
    setRecording(false);
    setTranscribing(true);
  }, [send]);

  const handleMicPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    startRecording();
  }, [startRecording]);

  const handleMicPointerUp = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    stopRecording();
  }, [stopRecording]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send(input);
      }
    },
    [input, send]
  );

  const isBusy = loading || transcribing;
  const showEmpty = messages.length === 0 || (messages.length === 1 && messages[0].id === 'welcome');

  return (
    <div className="flex h-full" style={{ minHeight: 0 }}>
      {/* ── Sidebar ─────────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="flex flex-col flex-shrink-0 border-r overflow-hidden"
          style={{
            width: '240px',
            background: 'var(--sidebar, var(--card))',
            borderColor: 'var(--border)',
          }}
        >
          {/* Sidebar header */}
          <div className="flex items-center justify-between px-3 py-3 flex-shrink-0">
            <div className="flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold"
                style={{ background: '#fbcfe8', color: '#be185d' }}
              >
                R
              </div>
              <span className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
                Ruby
              </span>
            </div>
            <button
              onClick={startNewSession}
              className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors hover:opacity-70"
              style={{ background: 'rgba(190,24,93,0.1)', color: '#be185d' }}
              title="New chat"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Sessions list */}
          <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
            {sessions.length === 0 && (
              <p className="text-xs px-2 py-4 text-center" style={{ color: 'var(--muted-foreground)' }}>
                No conversations yet
              </p>
            )}
            {sessions.map((s) => (
              <div
                key={s.id}
                onClick={() => switchSession(s.id)}
                className="group flex items-start gap-2 px-2 py-2 rounded-lg cursor-pointer transition-colors"
                style={{
                  background: s.id === sessionId ? 'rgba(190,24,93,0.08)' : 'transparent',
                }}
                onMouseEnter={(e) => {
                  if (s.id !== sessionId)
                    (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.04)';
                }}
                onMouseLeave={(e) => {
                  if (s.id !== sessionId)
                    (e.currentTarget as HTMLElement).style.background = 'transparent';
                }}
              >
                <MessageSquare
                  className="w-3.5 h-3.5 flex-shrink-0 mt-0.5"
                  style={{ color: s.id === sessionId ? '#be185d' : 'var(--muted-foreground)' }}
                />
                <div className="flex-1 min-w-0">
                  {editingTitle === s.id ? (
                    <div
                      className="flex gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        autoFocus
                        value={editTitleValue}
                        onChange={(e) => setEditTitleValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            updateSessionTitle(s.id, editTitleValue.trim() || 'Untitled');
                            setEditingTitle(null);
                          } else if (e.key === 'Escape') {
                            setEditingTitle(null);
                          }
                        }}
                        className="flex-1 text-xs rounded px-1 py-0.5 outline-none min-w-0"
                        style={{
                          background: 'var(--input-background)',
                          border: '1px solid var(--border)',
                          color: 'var(--foreground)',
                        }}
                      />
                      <button
                        onClick={() => {
                          updateSessionTitle(s.id, editTitleValue.trim() || 'Untitled');
                          setEditingTitle(null);
                        }}
                        className="text-green-500 hover:text-green-600"
                      >
                        <Check className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => setEditingTitle(null)}
                        className="hover:opacity-70"
                        style={{ color: 'var(--muted-foreground)' }}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <p
                      className="text-xs font-medium truncate leading-tight"
                      style={{ color: s.id === sessionId ? '#9d174d' : 'var(--foreground)' }}
                    >
                      {s.title ?? 'New conversation'}
                    </p>
                  )}
                  {s.lastMessage && editingTitle !== s.id && (
                    <p
                      className="text-[10px] truncate mt-0.5"
                      style={{ color: 'var(--muted-foreground)' }}
                    >
                      {s.lastMessage}
                    </p>
                  )}
                </div>
                {editingTitle !== s.id && (
                  <div
                    className="flex-shrink-0 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => {
                        setEditTitleValue(s.title ?? '');
                        setEditingTitle(s.id);
                      }}
                      className="hover:opacity-70"
                      style={{ color: 'var(--muted-foreground)' }}
                      title="Rename"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => deleteSession(s.id)}
                      className="hover:text-red-500 transition-colors"
                      style={{ color: 'var(--muted-foreground)' }}
                      title="Delete"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Main chat area ───────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0" style={{ minHeight: 0 }}>
        {/* Top bar */}
        <div
          className="flex items-center gap-3 px-4 py-3 flex-shrink-0 border-b"
          style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
        >
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors hover:opacity-70 flex-shrink-0"
            style={{ background: 'rgba(190,24,93,0.08)', color: '#be185d' }}
            title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          >
            <MessageSquare className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate" style={{ color: 'var(--foreground)' }}>
              {sessions.find((s) => s.id === sessionId)?.title ?? 'New conversation'}
            </p>
          </div>
          <button
            onClick={startNewSession}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors hover:opacity-80 flex-shrink-0"
            style={{ background: '#be185d', color: '#fff' }}
          >
            <Plus className="w-3.5 h-3.5" />
            New chat
          </button>
        </div>

        {/* Messages */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 py-6 space-y-6"
          style={{ minHeight: 0 }}
        >
          {/* Empty state */}
          {showEmpty && (
            <div className="flex flex-col items-center justify-center h-full gap-6 pb-8">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl font-bold"
                style={{ background: 'linear-gradient(135deg, #fce7f3, #fbcfe8)', color: '#be185d', border: '1px solid #f9a8d4' }}
              >
                R
              </div>
              <div className="text-center space-y-1">
                <h2 className="text-xl font-semibold" style={{ color: 'var(--foreground)' }}>
                  What can I help you with?
                </h2>
                <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
                  Ask me anything — I can write, research, code, plan, and more.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2 max-w-lg">
                {QUICK_PROMPTS.map((p) => (
                  <button
                    key={p}
                    onClick={() => send(p)}
                    disabled={isBusy}
                    className="rounded-full px-4 py-2 text-sm border transition-all hover:opacity-80 disabled:opacity-40"
                    style={{
                      background: 'var(--card)',
                      border: '1px solid var(--border)',
                      color: 'var(--foreground)',
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Actual messages */}
          {!showEmpty &&
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'bot' && (
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0 mt-0.5"
                    style={{ background: '#fbcfe8', color: '#be185d', border: '1px solid #f9a8d4' }}
                  >
                    R
                  </div>
                )}
                <div
                  className="rounded-2xl px-4 py-3 max-w-[80%]"
                  style={{
                    background: msg.role === 'user' ? '#be185d' : 'var(--input-background, var(--muted))',
                    color: msg.role === 'user' ? '#fff' : 'var(--foreground)',
                    border: msg.role === 'bot' ? '1px solid var(--border)' : 'none',
                  }}
                >
                  {msg.streaming && !msg.text ? (
                    <span className="flex items-center gap-1 py-1">
                      <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: '#f9a8d4', animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: '#f9a8d4', animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: '#f9a8d4', animationDelay: '300ms' }} />
                    </span>
                  ) : msg.role === 'bot' ? (
                    <div className="ruby-md">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text}</ReactMarkdown>
                      {msg.streaming && (
                        <span className="inline-block w-0.5 h-4 ml-0.5 align-middle animate-pulse" style={{ background: '#f9a8d4' }} />
                      )}
                    </div>
                  ) : (
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                  )}
                </div>
              </div>
            ))}

          {transcribing && (
            <div className="flex gap-3 justify-start">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0" style={{ background: '#fbcfe8', color: '#be185d' }}>
                R
              </div>
              <div className="rounded-2xl px-4 py-3 text-sm" style={{ background: 'var(--muted)', border: '1px solid var(--border)', color: 'var(--muted-foreground)' }}>
                Transcribing…
              </div>
            </div>
          )}
        </div>

        {/* Input area */}
        <div
          className="flex-shrink-0 px-4 pb-4 pt-2"
          style={{ borderTop: '1px solid var(--border)', background: 'var(--card)' }}
        >
          <div
            className="flex items-end gap-2 rounded-2xl px-3 py-2"
            style={{
              background: 'var(--input-background, var(--muted))',
              border: `1px solid ${recording ? '#f9a8d4' : 'var(--border)'}`,
              boxShadow: recording ? '0 0 0 2px rgba(249,168,212,0.3)' : 'none',
            }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                recording ? 'Listening…' : transcribing ? 'Transcribing…' : 'Ask Ruby anything… (try /summary)'
              }
              disabled={isBusy}
              rows={1}
              className="flex-1 resize-none outline-none text-sm leading-relaxed bg-transparent"
              style={{
                color: 'var(--foreground)',
                maxHeight: '160px',
                overflowY: 'auto',
              }}
              onInput={(e) => {
                const t = e.currentTarget;
                t.style.height = 'auto';
                t.style.height = Math.min(t.scrollHeight, 160) + 'px';
              }}
            />

            {/* Push-to-talk mic */}
            <button
              onPointerDown={handleMicPointerDown}
              onPointerUp={handleMicPointerUp}
              onPointerLeave={handleMicPointerUp}
              disabled={isBusy && !recording}
              className="w-8 h-8 flex items-center justify-center rounded-xl flex-shrink-0 transition-all disabled:opacity-40 select-none touch-none"
              style={{
                background: recording ? '#f9a8d4' : 'transparent',
                boxShadow: recording ? '0 0 12px rgba(249,168,212,0.6)' : 'none',
              }}
              title="Hold to speak"
            >
              <Mic className="w-4 h-4" style={{ color: recording ? '#9d174d' : 'var(--muted-foreground)' }} />
            </button>

            {/* Send button */}
            <button
              onClick={() => send(input)}
              disabled={!input.trim() || isBusy}
              className="w-8 h-8 flex items-center justify-center rounded-xl flex-shrink-0 transition-all disabled:opacity-40"
              style={{ background: input.trim() && !isBusy ? '#be185d' : 'var(--muted)', color: input.trim() && !isBusy ? '#fff' : 'var(--muted-foreground)' }}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[10px] text-center mt-2" style={{ color: 'var(--muted-foreground)' }}>
            Enter to send · Shift+Enter for new line · Hold mic to speak
          </p>
        </div>
      </div>
    </div>
  );
}
