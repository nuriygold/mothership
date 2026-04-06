'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { MothershipLogo } from '@/components/ui/mothership-logo';

type Message = {
  id: string;
  role: 'user' | 'bot';
  text: string;
  streaming?: boolean;
  ts: Date;
};

const QUICK_PROMPTS = [
  'Summarize blockers',
  'Draft follow-up to top email',
  'Adrian finance queue status',
];

// Persistent session key for conversation continuity
const SESSION_KEY = `booth-${Math.random().toString(36).slice(2)}`;

export function KissinBooth() {
  const [messages, setMessages] = useState<Message[]>([
    { id: 'welcome', role: 'bot', text: "Hey love, what can I help you with today?", ts: new Date() },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Gateway health check
  useEffect(() => {
    fetch('/api/openclaw/health')
      .then((r) => r.json())
      .then((d) => setConnected(d.ok === true))
      .catch(() => setConnected(false));
  }, []);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', text: trimmed, ts: new Date() };
    const botId = `b-${Date.now()}`;
    setMessages((prev) => [...prev, userMsg, { id: botId, role: 'bot', text: '', streaming: true, ts: new Date() }]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/v2/chat/gateway', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: trimmed, sessionKey: SESSION_KEY }),
      });

      if (!res.ok || !res.body) throw new Error(`Gateway ${res.status}`);

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
              setMessages((prev) => prev.map((m) => m.id === botId ? { ...m, text: snap } : m));
            } else if (evt.error) {
              accumulated = `⚠ ${evt.error}`;
              setMessages((prev) => prev.map((m) => m.id === botId ? { ...m, text: accumulated } : m));
            }
          } catch (_) {}
        }
      }

      setMessages((prev) => prev.map((m) => m.id === botId ? { ...m, streaming: false } : m));
    } catch (err) {
      const errText = err instanceof Error ? err.message : 'Unknown error';
      setMessages((prev) => prev.map((m) =>
        m.id === botId ? { ...m, text: `⚠ ${errText}`, streaming: false } : m
      ));
    } finally {
      setLoading(false);
    }
  }, [loading]);

  return (
    <div
      className="rounded-3xl overflow-hidden flex flex-col"
      style={{ border: '1px solid var(--border)', background: 'var(--card)' }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 relative"
        style={{ background: 'linear-gradient(135deg, #fce7f3 0%, #e4e0ff 45%, #c8f5ec 100%)' }}
      >
        <MothershipLogo size={40} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold" style={{ color: '#0F1B35' }}>The Kissin&apos; Booth</p>
          <p className="text-[11px]" style={{ color: '#5B6B8A' }}>Gateway • Direct line to the mothership</p>
        </div>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-medium flex-shrink-0"
          style={{
            background: connected ? 'rgba(0,180,100,0.15)' : 'rgba(255,184,0,0.15)',
            color: connected ? '#0A6B3A' : '#8B6B00',
          }}
        >
          {connected ? '● Live' : '● Polling'}
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
              <MothershipLogo size={24} style={{ marginRight: 6, marginTop: 2, flexShrink: 0 }} />
            )}
            <div
              className="rounded-2xl px-3 py-2 text-sm max-w-[80%] leading-relaxed"
              style={{
                background: msg.role === 'user' ? 'var(--color-purple)' : 'var(--input-background)',
                color: msg.role === 'user' ? '#FFFFFF' : 'var(--foreground)',
                border: msg.role === 'bot' ? '1px solid var(--border)' : 'none',
              }}
            >
              {msg.streaming && !msg.text ? (
                <span className="flex items-center gap-1 py-0.5">
                  <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: 'var(--color-cyan)', animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: 'var(--color-cyan)', animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: 'var(--color-cyan)', animationDelay: '300ms' }} />
                </span>
              ) : (
                <>
                  {msg.text}
                  {msg.streaming && (
                    <span className="inline-block w-0.5 h-3.5 ml-0.5 align-middle animate-pulse" style={{ background: 'var(--color-cyan)' }} />
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Quick prompts */}
      <div className="px-4 pb-2 flex flex-wrap gap-1.5">
        {QUICK_PROMPTS.map((p) => (
          <button
            key={p}
            onClick={() => send(p)}
            disabled={loading}
            className="rounded-full px-2.5 py-1 text-[11px] transition-opacity hover:opacity-80 disabled:opacity-40"
            style={{
              background: 'var(--muted)',
              color: 'var(--muted-foreground)',
              border: '1px solid var(--border)',
            }}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Input row */}
      <div className="px-4 pb-4 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send(input)}
          placeholder="Ask the Gateway anything..."
          disabled={loading}
          className="flex-1 rounded-2xl px-3 py-2 text-sm outline-none transition-all"
          style={{
            background: 'var(--input-background)',
            border: '1px solid var(--border)',
            color: 'var(--foreground)',
          }}
        />
        <button
          onClick={() => send(input)}
          disabled={!input.trim() || loading}
          className="w-9 h-9 flex items-center justify-center rounded-2xl flex-shrink-0 transition-opacity hover:opacity-80 disabled:opacity-40"
          style={{ background: 'var(--color-purple)' }}
        >
          <Send className="w-4 h-4 text-white" />
        </button>
      </div>
    </div>
  );
}
