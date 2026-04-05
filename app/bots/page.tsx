'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Card, CardSubtitle, CardTitle } from '@/components/ui/card';
import type { V2BotsFeed } from '@/lib/v2/types';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function BotsPage() {
  const { data, mutate } = useSWR<V2BotsFeed>('/api/v2/bots', fetcher, { refreshInterval: 30000 });
  const [streamStatus, setStreamStatus] = useState<'live' | 'fallback'>('fallback');

  useEffect(() => {
    const stream = new EventSource('/api/v2/stream/bots');
    stream.addEventListener('connected', () => setStreamStatus('live'));
    stream.addEventListener('task.routed', () => void mutate());
    stream.onerror = () => setStreamStatus('fallback');
    return () => stream.close();
  }, [mutate]);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Bots</h1>
          <p className="text-sm text-slate-500">Staffed operations bench with live orchestration signals.</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs ${streamStatus === 'live' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
          {streamStatus === 'live' ? 'Live stream' : 'Polling fallback'}
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(data?.bots ?? []).map((bot) => (
          <Card key={bot.identity.name}>
            <CardTitle>{bot.identity.name}</CardTitle>
            <CardSubtitle>{bot.identity.role}</CardSubtitle>
            <div className="mt-2 space-y-2 text-sm">
              <p className="text-slate-700">Now: {bot.liveState.currentTask}</p>
              <p className="text-xs text-slate-500">Status: {bot.liveState.status}</p>
              <p className="text-xs text-slate-500">
                Completed {bot.throughputMetrics.completed} • Queued {bot.throughputMetrics.queued} • Blocked {bot.throughputMetrics.blocked}
              </p>
              <p className="text-xs text-slate-500">{bot.staticProfile.workingStyle}</p>
              <div className="flex flex-wrap gap-1">
                {bot.staticProfile.strengths.map((strength) => (
                  <span key={strength} className="rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-700">
                    {strength}
                  </span>
                ))}
              </div>
              <div className="space-y-1">
                {bot.recentOutputs.slice(0, 3).map((output) => (
                  <div key={`${bot.identity.name}-${output.title}`} className="rounded-md border border-border bg-[var(--input-background)] p-2 text-xs text-slate-600">
                    {output.title} • {output.timestamp}
                  </div>
                ))}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

