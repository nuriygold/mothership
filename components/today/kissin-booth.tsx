'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Send } from 'lucide-react';

type BoothEvent = {
  id: string;
  input: string;
  status: string;
  sourceChannel: string;
};

async function fetchCommands() {
  const res = await fetch('/api/commands');
  return res.json();
}

export function KissinBooth() {
  const [prompt, setPrompt] = useState('');
  const [liveEvents, setLiveEvents] = useState<BoothEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ['booth-commands'], queryFn: fetchCommands });

  useEffect(() => {
    const stream = new EventSource('/api/v2/stream/kissin-booth');
    stream.addEventListener('connected', () => setConnected(true));
    stream.addEventListener('command.received', (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data);
        setLiveEvents((prev) => [payload, ...prev].slice(0, 4));
      } catch (_) {}
    });
    stream.onerror = () => setConnected(false);
    return () => stream.close();
  }, []);

  const mutation = useMutation({
    mutationFn: async (input: string) => {
      const res = await fetch('/api/commands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input, sourceChannel: 'today-booth' }),
      });
      if (!res.ok) throw new Error('Failed to send command');
      return res.json();
    },
    onSuccess: () => {
      setPrompt('');
      queryClient.invalidateQueries({ queryKey: ['booth-commands'] });
    },
  });

  const recentCards = useMemo(() => {
    const fromHistory = ((data ?? []) as Array<any>).slice(0, 3).map((item) => ({
      id: item.id,
      input: item.input,
      status: item.status,
      sourceChannel: item.sourceChannel,
    }));
    return [...liveEvents, ...fromHistory].slice(0, 3);
  }, [data, liveEvents]);

  const quickPrompts = [
    'Summarize blockers and route next actions',
    'Draft follow-up to top priority email',
    'Show Adrian finance queue exceptions',
  ];

  return (
    <div
      className="rounded-3xl overflow-hidden border"
      style={{ borderColor: 'var(--border)' }}
    >
      {/* Gradient hero area */}
      <div
        className="relative flex flex-col items-center pt-8 pb-6 px-5"
        style={{
          background: 'linear-gradient(135deg, #fce7f3 0%, #e4e0ff 45%, #c8f5ec 100%)',
        }}
      >
        {/* Live badge */}
        <span
          className={`absolute top-3 right-3 rounded-full px-2 py-0.5 text-[10px] font-medium ${
            connected ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
          }`}
        >
          {connected ? 'Live stream' : 'Polling mode'}
        </span>

        {/* Avatar circle */}
        <div
          className="w-16 h-16 rounded-full mb-4 flex items-center justify-center shadow-md"
          style={{
            background: 'radial-gradient(circle at 35% 35%, #4a3f8c, #0a0e1a)',
            boxShadow: '0 0 20px rgba(0,217,255,0.3), 0 4px 12px rgba(0,0,0,0.3)',
          }}
        >
          <span className="text-2xl">✦</span>
        </div>

        {/* Title */}
        <h3 className="font-semibold text-base" style={{ color: '#0F1B35' }}>
          ✦ The Kissin&apos; Booth
        </h3>
        <p className="text-xs mt-0.5 text-center" style={{ color: '#5B6B8A' }}>
          Hey love, what can I help you with today?
        </p>

        {/* Input */}
        <div className="mt-4 w-full flex gap-2">
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && prompt.trim() && mutation.mutate(prompt)}
            className="flex-1 rounded-xl px-3 py-2 text-sm outline-none"
            style={{
              background: 'rgba(255,255,255,0.85)',
              border: '1px solid rgba(255,255,255,0.7)',
              color: '#0F1B35',
            }}
            placeholder="Ask me anything..."
          />
          <button
            onClick={() => prompt.trim() && mutation.mutate(prompt)}
            disabled={!prompt.trim() || mutation.isLoading}
            className="w-9 h-9 flex items-center justify-center rounded-xl flex-shrink-0 transition-opacity hover:opacity-80 disabled:opacity-40"
            style={{ background: '#7B68EE' }}
          >
            <Send className="w-4 h-4 text-white" />
          </button>
        </div>

        {/* Quick prompts */}
        <div className="mt-2 flex flex-wrap gap-1.5 w-full">
          {quickPrompts.map((item) => (
            <button
              key={item}
              type="button"
              className="rounded-full px-2.5 py-1 text-[11px] transition-opacity hover:opacity-80"
              style={{
                background: 'rgba(255,255,255,0.7)',
                border: '1px solid rgba(255,255,255,0.7)',
                color: '#5B6B8A',
              }}
              onClick={() => setPrompt(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      {/* Command history — below gradient on white/card bg */}
      {recentCards.length > 0 && (
        <div
          className="px-4 py-3 space-y-2"
          style={{ background: 'var(--card)' }}
        >
          {recentCards.map((command) => (
            <div
              key={command.id}
              className="rounded-xl px-3 py-2"
              style={{
                background: 'var(--input-background)',
                border: '1px solid var(--border)',
              }}
            >
              <p className="truncate text-xs font-medium" style={{ color: 'var(--foreground)' }}>
                {command.input}
              </p>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                {command.sourceChannel} · {command.status}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
