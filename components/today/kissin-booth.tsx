'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

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
        setLiveEvents((prev) => [payload, ...prev].slice(0, 6));
      } catch (_error) {
        // ignore malformed payloads
      }
    });
    stream.onerror = () => {
      setConnected(false);
    };
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

  const cards = useMemo(() => {
    const fromHistory = ((data ?? []) as Array<any>).slice(0, 3).map((item) => ({
      id: item.id,
      input: item.input,
      status: item.status,
      sourceChannel: item.sourceChannel,
    }));
    return [...liveEvents, ...fromHistory].slice(0, 4);
  }, [data, liveEvents]);

  const quickPrompts = [
    'Summarize blockers and route next actions',
    'Draft follow-up to top priority email',
    'Show Adrian finance queue exceptions',
  ];

  return (
    <Card className="border-transparent bg-gradient-to-br from-indigo-100 via-fuchsia-100 to-cyan-100">
      <div className="flex items-center justify-between">
        <CardTitle>The Kissin&apos; Booth</CardTitle>
        <span className={`rounded-full px-2 py-1 text-[11px] ${connected ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
          {connected ? 'Live stream' : 'Polling mode'}
        </span>
      </div>
      <p className="mt-1 text-xs text-slate-600">Rich command orchestration with real-time responses.</p>

      <div className="mt-3 flex gap-2">
        <input
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          className="w-full rounded-md border border-white/70 bg-white/80 px-3 py-2 text-sm text-slate-900"
          placeholder="Ask me anything..."
        />
        <Button
          onClick={() => mutation.mutate(prompt)}
          disabled={!prompt.trim() || mutation.isLoading}
          className="bg-violet-500 hover:bg-violet-600"
        >
          Send
        </Button>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        {quickPrompts.map((item) => (
          <button
            key={item}
            type="button"
            className="rounded-full border border-white/70 bg-white/70 px-2 py-1 text-[11px] text-slate-700 hover:bg-white"
            onClick={() => setPrompt(item)}
          >
            {item}
          </button>
        ))}
      </div>

      <div className="mt-3 space-y-2">
        {cards.map((command) => (
          <div key={command.id} className="rounded-lg border border-white/70 bg-white/70 p-2">
            <p className="truncate text-xs font-semibold text-slate-800">{command.input}</p>
            <p className="text-[11px] text-slate-500">
              {command.sourceChannel} • {command.status}
            </p>
          </div>
        ))}
        {cards.length === 0 && <p className="text-xs text-slate-500">No booth activity yet.</p>}
      </div>
    </Card>
  );
}

