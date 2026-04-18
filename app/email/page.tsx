'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { ArrowLeft, Bot, ExternalLink, Send } from 'lucide-react';
import type {
  EmailTriageBucket,
  V2EmailDraft,
  V2EmailDraftFeed,
  V2EmailFeed,
  V2EmailItem,
  V2EmailTriageFeed,
  V2EmailTriageItem,
} from '@/lib/v2/types';
import { SlashCommandSheet } from '@/components/ui/slash-command-sheet';

const EMAIL_COMMANDS = [
  { cmd: '/add', args: '<title>', desc: 'Add task from email to task pool' },
  { cmd: '/buy', args: '<item>', desc: 'Add item to shopping list' },
  { cmd: '/vision', args: '<item>', desc: 'Add item to vision board' },
  { cmd: '/bill', args: '<vendor> $<amount> [date]', desc: 'Log a bill from email' },
];

const fetcher = (url: string) => fetch(url).then((res) => res.json());
const EMPTY_INBOX: V2EmailItem[] = [];
const EMPTY_TRIAGES: V2EmailTriageItem[] = [];

const BUCKET_META: Record<EmailTriageBucket, { label: string; thesis: string; color: string }> = {
  ACT_SOON: { label: 'Act Soon', thesis: 'These need a response or action in the next 24–48 hrs.', color: '#f59e0b' },
  NEED_HUMAN_EYES: { label: 'Need Your Eyes', thesis: 'Flagged as sensitive for manual handling.', color: '#fb7185' },
  BILLS: { label: 'Money Matters', thesis: 'Invoices, payment confirmations, and statements.', color: '#10b981' },
  RELATIONSHIP_KEEPER: { label: 'Relationship Keeper', thesis: 'People worth keeping warm — real connections.', color: '#ec4899' },
  PERSONAL: { label: 'Write Back', thesis: 'Drafts waiting for approval before sending.', color: '#38bdf8' },
  UPCOMING_EVENT: { label: 'Calendar Worthy', thesis: 'Invites and schedule-affecting emails.', color: '#a78bfa' },
  OPPORTUNITY_PILE: { label: 'Opportunity Pile', thesis: 'Useful later, not urgent right now.', color: '#eab308' },
  MARKETING: { label: 'Quick Toss', thesis: 'Newsletters and promos to batch-clear.', color: '#64748b' },
  NOT_YOUR_SPEED: { label: 'Not Your Speed', thesis: 'Likely low-fit messages for your inbox.', color: '#9ca3af' },
  OTHER: { label: 'Worth Knowing', thesis: 'Everything else, neatly held.', color: '#60a5fa' },
};

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatTime(timestamp: string) {
  const d = new Date(timestamp);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function extractSenderName(sender: string) {
  const match = sender.match(/^([^<]+)/);
  return match ? match[1].trim().replace(/^"(.*)"$/, '$1') : sender;
}

export default function EmailPage() {
  const { data, mutate: mutateInbox } = useSWR<V2EmailFeed>('/api/v2/email', fetcher, { refreshInterval: 30000 });
  const { data: triageFeed, mutate: mutateTriage } = useSWR<V2EmailTriageFeed>('/api/v2/email/triage', fetcher, { refreshInterval: 60000 });

  const inbox = data?.inbox ?? EMPTY_INBOX;
  const triages = triageFeed?.triages ?? EMPTY_TRIAGES;
  const lastRunAt = triageFeed?.lastRunAt ?? null;

  const [viewMode, setViewMode] = useState<'overview' | 'bucket'>('overview');
  const [activeTriage, setActiveTriage] = useState<V2EmailTriageItem | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [triageActing, setTriageActing] = useState<Record<string, 'loading' | 'done' | 'error'>>({});
  const [triageRunning, setTriageRunning] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [personalTab, setPersonalTab] = useState<'SEND' | 'REVIEW' | 'SKIP'>('SEND');

  const rubyCustomReadyRef = useRef(false);
  const { data: draftsFeed } = useSWR<V2EmailDraftFeed>(
    selectedId ? `/api/v2/email/${selectedId}/ai-drafts` : null,
    fetcher,
    { refreshInterval: () => (rubyCustomReadyRef.current ? 30000 : 4000) },
  );

  const drafts = useMemo(() => {
    const base = draftsFeed?.drafts ?? [];
    rubyCustomReadyRef.current = base.some((d) => d.tone === 'Ruby Custom');
    return base;
  }, [draftsFeed?.drafts]);

  const bucketEmails = useMemo(() => {
    if (!activeTriage) return [];
    const allowedIds = new Set(activeTriage.emailSummaries.map((e) => e.id));
    let emails = inbox.filter((mail) => allowedIds.has(mail.id));
    if (activeTriage.bucket === 'PERSONAL' && activeTriage.subGroups) {
      const bucketIds = new Set(activeTriage.subGroups[personalTab] ?? []);
      emails = emails.filter((mail) => bucketIds.has(mail.id));
    }
    return emails;
  }, [activeTriage, inbox, personalTab]);

  const selected = useMemo(() => {
    const pool = viewMode === 'bucket' ? bucketEmails : inbox;
    if (selectedId) return pool.find((email) => email.id === selectedId) ?? null;
    return pool[0] ?? null;
  }, [bucketEmails, inbox, selectedId, viewMode]);

  useEffect(() => {
    if (viewMode !== 'bucket') return;
    if (!selected && bucketEmails.length > 0) setSelectedId(bucketEmails[0].id);
  }, [viewMode, bucketEmails, selected]);

  const sourceLabel = useMemo(() => {
    const sources = [...new Set(inbox.map((e) => e.sourceIntegration).filter((s) => s !== 'Internal'))];
    if (sources.length === 0) return 'Internal';
    return sources.join(' + ');
  }, [inbox]);

  async function handleRunTriage() {
    if (triageRunning) return;
    setTriageRunning(true);
    try {
      await fetch('/api/v2/email/triage/run', { method: 'POST' });
      await Promise.all([mutateTriage(), mutateInbox()]);
    } finally {
      setTriageRunning(false);
    }
  }

  async function handleTriageApprove(id: string) {
    setTriageActing((s) => ({ ...s, [id]: 'loading' }));
    try {
      const res = await fetch(`/api/v2/email/triage/${id}/approve`, { method: 'POST' });
      const data = await res.json();
      setTriageActing((s) => ({ ...s, [id]: data.ok ? 'done' : 'error' }));
      setTimeout(() => mutateTriage(), 700);
    } catch {
      setTriageActing((s) => ({ ...s, [id]: 'error' }));
    }
  }

  async function handleTriageDeny(id: string) {
    setTriageActing((s) => ({ ...s, [id]: 'loading' }));
    try {
      await fetch(`/api/v2/email/triage/${id}/deny`, { method: 'POST' });
      setTriageActing((s) => ({ ...s, [id]: 'done' }));
      setTimeout(() => mutateTriage(), 400);
    } catch {
      setTriageActing((s) => ({ ...s, [id]: 'error' }));
    }
  }

  async function handleSendDraft(draft: V2EmailDraft) {
    await fetch(draft.approveWebhook, { method: 'POST' });
  }

  const triagedCount = triages.reduce((acc, item) => acc + item.emailSummaries.length, 0);
  const urgentCount = triages.reduce((acc, item) => acc + (item.urgentCount ?? 0), 0);
  const awaitingApproval = triages.length;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold" style={{ color: 'var(--foreground)' }}>Email</h1>
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
            Bucket-first triage. Active sources: <strong>{sourceLabel}</strong>.
          </p>
        </div>
        <SlashCommandSheet commands={EMAIL_COMMANDS} label="email" />
      </div>

      {viewMode === 'overview' && (
        <>
          <div className="rounded-3xl px-4 py-3 flex flex-wrap items-center gap-3" style={{ border: '1px solid var(--border)', background: 'var(--card)' }}>
            <span className="text-xs">{triagedCount} triaged</span>
            <span className="text-xs">{awaitingApproval} awaiting approval</span>
            <span className="text-xs">{urgentCount} urgent</span>
            <span className="text-xs">next run: {lastRunAt ? formatRelativeTime(lastRunAt) : 'never'}</span>
            <button
              type="button"
              onClick={handleRunTriage}
              disabled={triageRunning}
              className="ml-auto rounded-full px-3 py-1.5 text-xs font-semibold"
              style={{ background: 'var(--color-cyan)', color: '#071122' }}
            >
              {triageRunning ? 'Running…' : 'Run ▶'}
            </button>
          </div>

          {triages.length === 0 && (
            <div className="rounded-3xl p-8 text-center" style={{ border: '1px solid var(--border)', background: 'var(--card)' }}>
              <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>No pending triage buckets.</p>
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            {triages.map((triage) => {
              const meta = BUCKET_META[triage.bucket] ?? BUCKET_META.OTHER;
              const acting = triageActing[triage.id] ?? 'idle';
              return (
                <div key={triage.id} className="rounded-3xl p-4 space-y-3" style={{ border: '1px solid var(--border)', background: 'var(--card)' }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: meta.color, boxShadow: (triage.urgentCount ?? 0) > 0 ? `0 0 0 8px ${meta.color}25` : 'none' }} />
                      <p className="text-sm font-semibold">{meta.label}</p>
                    </div>
                    <span className="text-[10px] rounded-full px-2 py-0.5" style={{ background: 'var(--muted)' }}>{triage.confidence ?? 'NEEDS_YOUR_EYES'}</span>
                  </div>
                  <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{meta.thesis}</p>
                  <div className="flex flex-wrap gap-1">
                    {triage.emailSummaries.slice(0, 3).map((e) => (
                      <span key={e.id} className="text-[11px] rounded-full px-2 py-0.5" style={{ border: '1px solid var(--border)' }}>{e.subject}</span>
                    ))}
                    {triage.emailSummaries.length > 3 && <span className="text-[11px]">+{triage.emailSummaries.length - 3} more</span>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => handleTriageApprove(triage.id)} className="rounded-full px-3 py-1.5 text-xs font-semibold" style={{ background: meta.color, color: '#0b1020' }}>
                      {acting === 'loading' ? '…' : acting === 'done' ? 'Done ✓' : 'Approve'}
                    </button>
                    <button type="button" onClick={() => handleTriageDeny(triage.id)} className="rounded-full px-3 py-1.5 text-xs" style={{ border: '1px solid var(--border)' }}>
                      Dismiss
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTriage(triage);
                        setViewMode('bucket');
                        setShowDetail(false);
                        setSelectedId(triage.emailSummaries[0]?.id ?? null);
                      }}
                      className="rounded-full px-3 py-1.5 text-xs"
                      style={{ border: '1px solid var(--border)' }}
                    >
                      → View Emails
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {viewMode === 'bucket' && activeTriage && (
        <>
          <button
            type="button"
            onClick={() => {
              setViewMode('overview');
              setActiveTriage(null);
              setSelectedId(null);
            }}
            className="flex items-center gap-2 text-sm"
            style={{ color: 'var(--color-cyan)' }}
          >
            <ArrowLeft className="w-4 h-4" /> All Buckets
          </button>

          <div className="grid gap-0 lg:grid-cols-[380px_1fr]" style={{ minHeight: 'calc(100vh - 260px)' }}>
            <div className={`rounded-3xl lg:rounded-r-none overflow-hidden border ${showDetail ? 'hidden lg:block' : 'block'}`} style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
              {activeTriage.bucket === 'PERSONAL' && activeTriage.subGroups && (
                <div className="flex gap-2 p-3 border-b" style={{ borderColor: 'var(--border)' }}>
                  {(['SEND', 'REVIEW', 'SKIP'] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setPersonalTab(tab)}
                      className="rounded-full px-3 py-1.5 text-xs"
                      style={{ background: personalTab === tab ? 'var(--color-cyan)' : 'var(--muted)' }}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
              )}
              <div className="p-2 space-y-1">
                {bucketEmails.map((email: V2EmailItem) => (
                  <button
                    key={email.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(email.id);
                      setShowDetail(true);
                    }}
                    className="w-full text-left rounded-2xl p-3"
                    style={{ border: selected?.id === email.id ? '1px solid var(--color-cyan)' : '1px solid transparent' }}
                  >
                    <div className="flex justify-between gap-2">
                      <p className="text-sm font-semibold truncate">{extractSenderName(email.sender)}</p>
                      <p className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>{formatTime(email.timestamp)}</p>
                    </div>
                    <p className="text-sm truncate">{email.subject}</p>
                    <p className="text-xs truncate" style={{ color: 'var(--muted-foreground)' }}>{email.snippet ?? email.preview}</p>
                    <div className="mt-2 inline-flex rounded-full px-2 py-0.5 text-[10px]" style={{ border: '1px solid var(--border)' }}>{email.sourceIntegration}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className={`rounded-3xl lg:rounded-l-none overflow-hidden border ${showDetail ? 'block' : 'hidden lg:block'}`} style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
              <button type="button" onClick={() => setShowDetail(false)} className="lg:hidden flex items-center gap-2 p-4 text-sm" style={{ color: 'var(--color-cyan)' }}>
                <ArrowLeft className="w-4 h-4" /> Back to Bucket
              </button>
              {!selected ? (
                <div className="p-8 text-sm" style={{ color: 'var(--muted-foreground)' }}>Choose an email from this bucket.</div>
              ) : (
                <div className="p-5 space-y-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h2 className="text-lg font-semibold">{selected.subject}</h2>
                      <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                        From {extractSenderName(selected.sender)} · {selected.sourceIntegration}
                      </p>
                    </div>
                    {selected.gmailLink && (
                      <a href={selected.gmailLink} target="_blank" rel="noreferrer" className="text-xs flex items-center gap-1" style={{ color: 'var(--color-cyan)' }}>
                        <ExternalLink className="w-3 h-3" /> Open
                      </a>
                    )}
                  </div>

                  <div className="rounded-2xl p-4 text-sm" style={{ background: 'var(--muted)' }}>
                    {selected.snippet ?? selected.preview}
                  </div>

                  <div>
                    <p className="text-xs mb-2" style={{ color: 'var(--muted-foreground)' }}>Drafts</p>
                    <div className="space-y-2">
                      {drafts.map((draft) => (
                        <div key={draft.id} className="rounded-xl p-3" style={{ border: '1px solid var(--border)' }}>
                          <div className="flex items-center justify-between">
                            <div className="text-xs font-semibold flex items-center gap-1"><Bot className="w-3 h-3" /> {draft.tone}</div>
                            <button type="button" onClick={() => handleSendDraft(draft)} className="rounded-full px-3 py-1 text-xs flex items-center gap-1" style={{ background: 'var(--color-purple)', color: 'white' }}>
                              <Send className="w-3 h-3" /> Send
                            </button>
                          </div>
                          <p className="text-xs mt-2 whitespace-pre-wrap" style={{ color: 'var(--muted-foreground)' }}>{draft.body}</p>
                        </div>
                      ))}
                      {drafts.length === 0 && <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Generating drafts…</p>}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
