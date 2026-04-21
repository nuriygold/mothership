'use client';

import Link from 'next/link';
import { CheckCircle2, Mail, Send } from 'lucide-react';
import type { V2TasksFeed } from '@/lib/v2/types';

type Campaign = {
  id: string;
  title: string;
  status: string | null;
};

type DailyBriefingProps = {
  tasksData: V2TasksFeed | undefined;
  campaigns: Campaign[] | undefined;
};

const RUNNING_STATUSES = new Set(['EXECUTING', 'READY', 'SCHEDULED', 'QUEUED']);
const PLANNED_STATUSES = new Set(['DRAFT', 'PLANNING']);

function formatDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export function DailyBriefing({ tasksData, campaigns }: DailyBriefingProps) {
  const activeTaskCount = tasksData?.counters.active ?? 0;
  const dueTodayCount = tasksData?.today.length ?? 0;

  const runningCampaigns = campaigns?.filter((c) => c.status && RUNNING_STATUSES.has(c.status)).length ?? 0;
  const plannedCampaigns = campaigns?.filter((c) => c.status && PLANNED_STATUSES.has(c.status)).length ?? 0;

  return (
    <div
      className="rounded-2xl px-4 py-3 flex flex-col gap-2"
      style={{
        background: 'rgba(0,217,255,0.06)',
        borderLeft: '3px solid var(--color-cyan)',
        border: '1px solid rgba(0,217,255,0.18)',
        borderLeftWidth: '3px',
      }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--color-cyan)' }}>
          📋 Today&apos;s Briefing
        </span>
        <span className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
          {formatDate()}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        {/* Tasks */}
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--color-cyan)' }} />
          <span className="text-sm" style={{ color: 'var(--foreground)' }}>
            {tasksData ? (
              <>
                <span className="font-medium">{activeTaskCount}</span> task{activeTaskCount !== 1 ? 's' : ''} active
                {dueTodayCount > 0 && (
                  <>, <span className="font-medium">{dueTodayCount}</span> due today</>
                )}
              </>
            ) : (
              <span style={{ color: 'var(--muted-foreground)' }}>Loading tasks…</span>
            )}
          </span>
        </div>

        {/* Email */}
        <div className="flex items-center gap-2">
          <Mail className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--color-cyan)' }} />
          <span className="text-sm" style={{ color: 'var(--foreground)' }}>
            <Link href="/email" className="underline decoration-dotted hover:opacity-80 transition-opacity">
              Check inbox
            </Link>
            {' '}— emails sorted by priority
          </span>
        </div>

        {/* Campaigns */}
        <div className="flex items-center gap-2">
          <Send className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--color-cyan)' }} />
          <span className="text-sm" style={{ color: 'var(--foreground)' }}>
            {campaigns ? (
              <>
                Campaigns:{' '}
                <Link href="/dispatch" className="underline decoration-dotted hover:opacity-80 transition-opacity">
                  <span className="font-medium">{runningCampaigns}</span> running
                  {plannedCampaigns > 0 && <>, <span className="font-medium">{plannedCampaigns}</span> planned</>}
                </Link>
              </>
            ) : (
              <Link href="/dispatch" className="underline decoration-dotted hover:opacity-80 transition-opacity">
                View campaigns
              </Link>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
