'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Bot, CheckCircle2, Settings, Zap, Activity } from 'lucide-react';
import type { V2BotProfile, V2BotsFeed } from '@/lib/v2/types';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

// Each bot gets a unique pastel card background
const BOT_CARD_BG: Record<string, string> = {
  Adrian:          'var(--color-mint)',
  Ruby:            'var(--color-pink)',
  Emerald:         'var(--color-sky)',
  'Adobe Pettaway': 'var(--color-lemon)',
};

const BOT_CARD_TEXT: Record<string, string> = {
  Adrian:          'var(--color-mint-text)',
  Ruby:            'var(--color-pink-text)',
  Emerald:         'var(--color-sky-text)',
  'Adobe Pettaway': 'var(--color-lemon-text)',
};

const STATUS_DOT: Record<string, string> = {
  active:  'var(--color-cyan)',
  working: 'var(--color-cyan)',
  idle:    '#FFB800',
  pending: '#FFB800',
  blocked: '#E53E3E',
  done:    'var(--color-cyan)',
};

function BotCard({ bot }: { bot: V2BotProfile }) {
  const bg = BOT_CARD_BG[bot.identity.name] ?? 'var(--color-lavender)';
  const textColor = BOT_CARD_TEXT[bot.identity.name] ?? 'var(--color-lavender-text)';
  const statusColor = STATUS_DOT[bot.liveState.status] ?? 'var(--color-cyan)';

  return (
    <div
      className="rounded-3xl p-5 flex flex-col"
      style={{ background: bg, border: '1px solid rgba(0,0,0,0.06)' }}
    >
      {/* Header: icon + name + status */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.8)' }}
          >
            <Bot className="w-5 h-5" style={{ color: textColor }} />
          </div>
          <div>
            <h3 className="text-lg font-semibold" style={{ color: '#0F1B35' }}>{bot.identity.name}</h3>
            <p className="text-xs" style={{ color: textColor }}>{bot.identity.role}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ background: statusColor }} />
          <Zap className="w-3.5 h-3.5" style={{ color: 'var(--color-cyan)' }} />
        </div>
      </div>

      {/* Currently working on */}
      <div
        className="rounded-2xl px-4 py-3 mb-4"
        style={{ background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.8)' }}
      >
        <p className="text-[10px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: textColor }}>Currently</p>
        <p className="text-sm font-medium" style={{ color: '#0F1B35' }}>{bot.liveState.currentTask}</p>
      </div>

      {/* Throughput metrics */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {[
          { label: 'Completed', value: bot.throughputMetrics.completed, color: 'var(--color-mint)' },
          { label: 'Queued',    value: bot.throughputMetrics.queued,    color: 'var(--color-lavender)' },
          { label: 'Blocked',   value: bot.throughputMetrics.blocked,   color: 'var(--color-peach)' },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            className="rounded-2xl py-3 text-center"
            style={{ background: color, border: '1px solid rgba(0,0,0,0.04)' }}
          >
            <p className="text-xl font-bold" style={{ color: '#0F1B35' }}>{value}</p>
            <p className="text-[10px] font-medium" style={{ color: 'var(--muted-foreground)' }}>{label}</p>
          </div>
        ))}
      </div>

      {/* Recent outputs */}
      {bot.recentOutputs.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-semibold mb-2" style={{ color: textColor }}>Recent Outputs</p>
          <div className="space-y-1.5">
            {bot.recentOutputs.slice(0, 3).map((output, idx) => (
              <div key={idx} className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--color-cyan)' }} />
                  <span className="text-sm truncate" style={{ color: '#0F1B35' }}>{output.title}</span>
                </div>
                <span className="text-[11px] flex-shrink-0 ml-2" style={{ color: 'var(--muted-foreground)' }}>
                  {output.timestamp}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Working style */}
      <div className="mb-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: textColor }}>Working Style</p>
        <p className="text-sm" style={{ color: '#0F1B35' }}>{bot.staticProfile.workingStyle}</p>
      </div>

      {/* Personality */}
      <div className="mb-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: textColor }}>Personality</p>
        <p className="text-sm italic" style={{ color: '#0F1B35' }}>{bot.staticProfile.personality}</p>
      </div>

      {/* Strengths */}
      <div className="mb-4">
        <p className="text-[10px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: textColor }}>Strengths</p>
        <div className="flex flex-wrap gap-1.5">
          {bot.staticProfile.strengths.map((s) => (
            <span
              key={s}
              className="rounded-full px-2.5 py-1 text-[11px] font-medium"
              style={{ background: 'rgba(255,255,255,0.6)', color: '#0F1B35', border: '1px solid rgba(255,255,255,0.8)' }}
            >
              {s}
            </span>
          ))}
        </div>
      </div>

      {/* Footer: View Details + Settings */}
      <div className="mt-auto flex items-center gap-2">
        <button
          className="flex-1 rounded-2xl py-3 text-sm font-semibold text-center transition-opacity hover:opacity-85"
          style={{ background: 'var(--color-purple)', color: '#FFFFFF' }}
        >
          View Details
        </button>
        <button
          className="w-11 h-11 rounded-2xl flex items-center justify-center transition-opacity hover:opacity-80"
          style={{ background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.8)' }}
        >
          <Settings className="w-4 h-4" style={{ color: textColor }} />
        </button>
      </div>
    </div>
  );
}

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
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold" style={{ color: 'var(--foreground)' }}>Bots</h1>
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>Your staffed operations bench</p>
        </div>
        <span
          className="rounded-full px-3 py-1 text-xs font-medium"
          style={{
            background: streamStatus === 'live' ? 'var(--color-mint)' : 'var(--color-lemon)',
            color: streamStatus === 'live' ? 'var(--color-mint-text)' : 'var(--color-lemon-text)',
          }}
        >
          {streamStatus === 'live' ? 'Live stream' : 'Polling fallback'}
        </span>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {(data?.bots ?? []).map((bot) => (
          <BotCard key={bot.identity.name} bot={bot} />
        ))}
      </div>
    </div>
  );
}
