'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { Send, RefreshCw } from 'lucide-react';

type StreamEvent = {
  id: string;
  timestamp: string;
  direction: 'inbound' | 'outbound';
  text: string;
  chatId: string;
  botKey: string;
  agentLabel: string;
};

type StreamsResponse = { events: StreamEvent[] };

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const AGENTS = [
  { botKey: 'bot1', label: 'Adrian' },
  { botKey: 'bot2', label: 'Ruby' },
  { botKey: 'bot3', label: 'Emerald' },
  { botKey: 'botAdobe', label: 'Adobe' },
] as const;

function timeAgo(iso: string) {
  const delta = Date.now() - new Date(iso).getTime();
  const min = Math.floor(delta / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function TelegramStreamsPage() {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<Record<string, boolean>>({});
  const { data, isLoading, mutate } = useSWR<StreamsResponse>('/api/telegram/streams', fetcher, {
    refreshInterval: 10000,
  });

  const grouped = useMemo(() => {
    const events = data?.events ?? [];
    return AGENTS.map((agent) => ({
      ...agent,
      events: events.filter((evt) => evt.botKey === agent.botKey || evt.agentLabel === agent.label).slice(0, 25),
    }));
  }, [data]);

  async function send(botKey: string) {
    const text = (drafts[botKey] ?? '').trim();
    if (!text || sending[botKey]) return;

    setSending((prev) => ({ ...prev, [botKey]: true }));
    try {
      const res = await fetch('/api/telegram/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, botKey }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      setDrafts((prev) => ({ ...prev, [botKey]: '' }));
      await mutate();
    } finally {
      setSending((prev) => ({ ...prev, [botKey]: false }));
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold" style={{ color: 'var(--foreground)' }}>Telegram Streams</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--muted-foreground)' }}>
            A page-style console view for each Telegram bot/agent thread.
          </p>
        </div>
        <button
          onClick={() => void mutate()}
          className="rounded-xl px-3 py-2 text-sm flex items-center gap-1.5"
          style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {grouped.map((stream) => (
          <section
            key={stream.botKey}
            className="rounded-2xl p-4 flex flex-col gap-3"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold" style={{ color: 'var(--foreground)' }}>{stream.label}</h2>
              <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{stream.events.length} events</span>
            </div>

            <div className="rounded-xl p-3 h-72 overflow-y-auto" style={{ background: 'var(--background)', border: '1px solid var(--border)' }}>
              {stream.events.length === 0 ? (
                <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
                  No events yet for this stream. Send a message to start this console.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {stream.events.map((event) => (
                    <div
                      key={event.id}
                      className="rounded-lg px-3 py-2 text-sm"
                      style={{
                        background: event.direction === 'outbound' ? 'rgba(4,112,160,0.15)' : 'rgba(139,92,246,0.13)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      <div className="flex items-center justify-between gap-2 text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
                        <span>{event.direction === 'outbound' ? 'Sent' : 'Received'} · chat {event.chatId}</span>
                        <span>{timeAgo(event.timestamp)}</span>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap" style={{ color: 'var(--foreground)' }}>{event.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <input
                value={drafts[stream.botKey] ?? ''}
                onChange={(e) => setDrafts((prev) => ({ ...prev, [stream.botKey]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void send(stream.botKey);
                  }
                }}
                placeholder={`Message ${stream.label}...`}
                className="w-full rounded-xl px-3 py-2 text-sm outline-none"
                style={{ background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
              />
              <button
                onClick={() => void send(stream.botKey)}
                disabled={sending[stream.botKey]}
                className="rounded-xl px-3 py-2 text-sm flex items-center gap-1 disabled:opacity-40"
                style={{ background: '#0470a0', color: '#fff' }}
              >
                <Send className="w-3.5 h-3.5" /> Send
              </button>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
