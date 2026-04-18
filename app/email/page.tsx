'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { ExternalLink, Reply, Forward, Bot, Trash2, BellOff, CheckSquare, Calendar, ShoppingCart, Zap, DollarSign, Eye, Send, X, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import type { V2EmailDraft, V2EmailDraftFeed, V2EmailFeed, V2EmailItem, V2EmailTriageFeed, V2EmailTriageItem, EmailTriageBucket } from '@/lib/v2/types';
import { SlashCommandSheet } from '@/components/ui/slash-command-sheet';

const EMAIL_COMMANDS = [
  { cmd: '/add',    args: '<title>', desc: 'Add task from email to task pool' },
  { cmd: '/buy',    args: '<item>',  desc: 'Add item to shopping list' },
  { cmd: '/vision', args: '<item>',  desc: 'Add item to vision board' },
  { cmd: '/bill',   args: '<vendor> $<amount> [date]', desc: 'Log a bill from email' },
];

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const BUCKET_META: Record<EmailTriageBucket, { label: string; icon: string; agentColor: string; agentTextColor: string; cardBg: string }> = {
  MARKETING:          { label: 'Marketing & Promos',    icon: '📣', agentColor: 'var(--color-peach)',    agentTextColor: 'var(--color-peach-text)',    cardBg: 'rgba(255,160,100,0.07)' },
  PERSONAL:           { label: 'Personal — Needs Reply', icon: '✉️', agentColor: 'var(--color-lavender)', agentTextColor: 'var(--color-lavender-text)', cardBg: 'rgba(180,140,255,0.07)' },
  UPCOMING_EVENT:     { label: 'Upcoming Events',        icon: '📅', agentColor: 'var(--color-mint)',     agentTextColor: 'var(--color-mint-text)',     cardBg: 'rgba(0,217,180,0.07)'   },
  BILLS:              { label: 'Bills & Payments',       icon: '💳', agentColor: 'var(--color-sky)',      agentTextColor: 'var(--color-sky-text)',      cardBg: 'rgba(80,180,255,0.07)'  },
  OTHER:              { label: 'Other',                  icon: '📬', agentColor: 'var(--muted)',           agentTextColor: 'var(--muted-foreground)',    cardBg: 'var(--muted)'           },
  ACT_SOON:           { label: 'Act Soon',               icon: '⚡', agentColor: 'var(--color-peach)',    agentTextColor: 'var(--color-peach-text)',    cardBg: 'rgba(255,160,100,0.07)' },
  OPPORTUNITY_PILE:   { label: 'Opportunity Pile',       icon: '💎', agentColor: 'var(--color-mint)',     agentTextColor: 'var(--color-mint-text)',     cardBg: 'rgba(0,217,180,0.07)'   },
  NOT_YOUR_SPEED:     { label: 'Not Your Speed',         icon: '🚫', agentColor: 'var(--muted)',          agentTextColor: 'var(--muted-foreground)',    cardBg: 'var(--muted)'           },
  NEED_HUMAN_EYES:    { label: 'Need Human Eyes',        icon: '👁️', agentColor: 'var(--color-sky)',      agentTextColor: 'var(--color-sky-text)',      cardBg: 'rgba(80,180,255,0.07)'  },
  RELATIONSHIP_KEEPER: { label: 'Relationship Keeper',   icon: '🤝', agentColor: 'var(--color-lavender)', agentTextColor: 'var(--color-lavender-text)', cardBg: 'rgba(180,140,255,0.07)' },
};

const TABS = ['Inbox', 'Drafts', 'Sent'] as const;

const DRAFT_COLORS: Record<string, { bg: string; textColor: string }> = {
  Enthusiastic:  { bg: 'var(--color-mint)',     textColor: 'var(--color-mint-text)' },
  Measured:      { bg: 'var(--color-sky)',       textColor: 'var(--color-sky-text)' },
  Decline:       { bg: 'var(--color-peach)',     textColor: 'var(--color-peach-text)' },
  'Ruby Custom': { bg: 'var(--color-lavender)',  textColor: 'var(--color-lavender-text)' },
};

const DRAFT_DESCRIPTIONS: Record<string, { title: string; subtitle: string }> = {
  Enthusiastic:  { title: 'Enthusiastic & Collaborative', subtitle: 'Express interest and propose next steps with warmth' },
  Measured:      { title: 'Professional & Measured',      subtitle: 'Request more details before committing' },
  Decline:       { title: 'Polite Decline',               subtitle: "Thank them but indicate this isn't the right fit" },
  'Ruby Custom': { title: 'Ruby Custom Draft',            subtitle: 'AI-generated contextual response' },
};

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  return `${hours} hr ago`;
}

function formatTime(timestamp: string) {
  const d = new Date(timestamp);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function extractSenderName(sender: string) {
  const match = sender.match(/^([^<]+)/);
  return match ? match[1].trim().replace(/^"(.*)"$/, '$1') : sender;
}

function extractEmail(sender: string): string {
  const match = sender.match(/<([^>]+)>/);
  return match ? match[1] : sender.trim();
}

type ActionStatus = 'idle' | 'loading' | 'done' | 'error';

export default function EmailPage() {
  const { data, mutate: mutateInbox } = useSWR<V2EmailFeed>('/api/v2/email', fetcher, { refreshInterval: 30000 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [liveDraft, setLiveDraft] = useState<V2EmailDraft | null>(null);
  const [activeTab, setActiveTab] = useState<typeof TABS[number]>('Inbox');
  const [showDetail, setShowDetail] = useState(false);

  // Draft send state
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sendResult, setSendResult] = useState<{ id: string; ok: boolean } | null>(null);
  const [sentDraftIds, setSentDraftIds] = useState<Set<string>>(new Set());

  // Compose state
  const [composeMode, setComposeMode] = useState<'reply' | 'forward' | null>(null);
  const [composeTo, setComposeTo] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [composeSending, setComposeSending] = useState(false);
  const [composeResult, setComposeResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Action button states
  const [actionStates, setActionStates] = useState<Record<string, ActionStatus>>({});
  const [actionMessages, setActionMessages] = useState<Record<string, string>>({});

  // Draft selection & editing modals
  const [showToneSelector, setShowToneSelector] = useState(false);
  const [selectedTone, setSelectedTone] = useState<string | null>(null);
  const [draftEditorModal, setDraftEditorModal] = useState<V2EmailDraft | null>(null);
  const [editingBody, setEditingBody] = useState('');

  // Agent triage suggestions
  const { data: triageFeed, mutate: mutateTriage } = useSWR<V2EmailTriageFeed>('/api/v2/email/triage', fetcher, { refreshInterval: 60000 });
  const triages = triageFeed?.triages ?? [];
  const lastRunAt = triageFeed?.lastRunAt ?? null;
  const [triageActing, setTriageActing] = useState<Record<string, 'loading' | 'done' | 'error'>>({});
  const [triageExpanded, setTriageExpanded] = useState(true);
  const [triageRunning, setTriageRunning] = useState(false);

  const inbox = data?.inbox ?? [];

  const selected = useMemo(() => {
    if (selectedId) return inbox.find((item) => item.id === selectedId) ?? null;
    return inbox[0] ?? null;
  }, [inbox, selectedId]);

  useEffect(() => {
    if (!selected && inbox.length) setSelectedId(inbox[0].id);
  }, [inbox, selected]);

  // Reset compose + action state when email changes
  useEffect(() => {
    setComposeMode(null);
    setComposeBody('');
    setComposeTo('');
    setComposeResult(null);
    setActionStates({});
    setActionMessages({});
    setShowToneSelector(false);
    setSelectedTone(null);
    setDraftEditorModal(null);
    setEditingBody('');
    rubyCustomReadyRef.current = false;
  }, [selectedId]);

  // Drafts polling — fast interval until Ruby Custom draft arrives, then slow down
  const rubyCustomReadyRef = useRef(false);
  const { data: draftsFeed } = useSWR<V2EmailDraftFeed>(
    selected ? `/api/v2/email/${selected.id}/ai-drafts` : null,
    fetcher,
    { refreshInterval: () => rubyCustomReadyRef.current ? 30000 : 4000 }
  );

  // SSE draft stream
  const [draftStreamError, setDraftStreamError] = useState<string | null>(null);
  useEffect(() => {
    setLiveDraft(null);
    setDraftStreamError(null);
    if (!selectedId) return;
    const stream = new EventSource(`/api/v2/stream/email/${selectedId}/drafts`);
    stream.addEventListener('draft.generated', (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data);
        setLiveDraft(payload.draft as V2EmailDraft);
      } catch (_) {}
    });
    stream.addEventListener('draft.send_failed', (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data);
        setDraftStreamError(payload.error ?? 'Send failed');
        setTimeout(() => setDraftStreamError(null), 4000);
      } catch (_) {}
    });
    return () => stream.close();
  }, [selectedId]);

  const drafts = useMemo(() => {
    const base = draftsFeed?.drafts ?? [];
    const combined = liveDraft && !base.some((item) => item.id === liveDraft.id) ? [...base, liveDraft] : base;
    rubyCustomReadyRef.current = combined.some((d) => d.tone === 'Ruby Custom');
    return combined;
  }, [draftsFeed?.drafts, liveDraft]);

  const inboxCount = inbox.filter((e) => !e.isRead).length || inbox.length;
  const draftsRef = useRef<HTMLDivElement>(null);

  // ── Action helpers ──────────────────────────────────────────────
  async function runAction(key: string, fn: () => Promise<{ ok?: boolean; error?: string; [k: string]: unknown }>, successMsg: string) {
    setActionStates((s) => ({ ...s, [key]: 'loading' }));
    setActionMessages((s) => ({ ...s, [key]: '' }));
    try {
      const res = await fn();
      if (res.ok === false || res.error) {
        setActionStates((s) => ({ ...s, [key]: 'error' }));
        setActionMessages((s) => ({ ...s, [key]: (res.error as string) ?? 'Failed' }));
      } else {
        setActionStates((s) => ({ ...s, [key]: 'done' }));
        setActionMessages((s) => ({ ...s, [key]: successMsg }));
        setTimeout(() => setActionStates((s) => ({ ...s, [key]: 'idle' })), 3500);
      }
    } catch (err) {
      setActionStates((s) => ({ ...s, [key]: 'error' }));
      setActionMessages((s) => ({ ...s, [key]: err instanceof Error ? err.message : 'Error' }));
    }
  }

  async function handleDelete() {
    if (!selected) return;
    const id = selected.id;
    await runAction('delete', async () => {
      const res = await fetch(`/api/v2/email/${id}`, { method: 'DELETE' });
      return res.json();
    }, 'Deleted');
    // Optimistically remove from list after success
    setTimeout(() => mutateInbox(), 500);
  }

  async function handleUnsubscribe() {
    if (!selected) return;
    await runAction('unsubscribe', async () => {
      const res = await fetch(`/api/v2/email/${selected.id}/unsubscribe`, { method: 'POST' });
      return res.json();
    }, 'Unsubscribed');
  }

  async function handleDeleteAndUnsubscribe() {
    if (!selected) return;
    const id = selected.id;
    await runAction('delete-unsubscribe', async () => {
      const [unsubRes, delRes] = await Promise.all([
        fetch(`/api/v2/email/${id}/unsubscribe`, { method: 'POST' }),
        fetch(`/api/v2/email/${id}`, { method: 'DELETE' }),
      ]);
      const delJson = await delRes.json();
      if (!unsubRes.ok && !delRes.ok) return { ok: false, error: 'Both actions failed' };
      return delJson;
    }, 'Unsubscribed & deleted');
    setTimeout(() => mutateInbox(), 500);
  }

  async function handleMakeTask(type: 'task' | 'financial') {
    if (!selected) return;
    const key = type === 'financial' ? 'financial-task' : 'task';
    await runAction(key, async () => {
      const res = await fetch(`/api/v2/email/${selected.id}/create-task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      });
      return res.json();
    }, type === 'financial' ? 'Financial task created' : 'Task created');
  }

  async function handleAddToCalendar() {
    if (!selected) return;
    await runAction('calendar', async () => {
      const res = await fetch(`/api/v2/email/${selected.id}/add-to-calendar`, { method: 'POST' });
      const data = await res.json();
      if (data.htmlLink) window.open(data.htmlLink, '_blank');
      return data;
    }, 'Added to calendar');
  }

  async function handleVisionBoard() {
    if (!selected) return;
    await runAction('vision', async () => {
      const res = await fetch(`/api/v2/email/${selected.id}/vision-item`, { method: 'POST' });
      return res.json();
    }, 'Added to Vision Board');
  }

  async function handleShoppingList() {
    if (!selected) return;
    await runAction('shopping', async () => {
      const res = await fetch(`/api/v2/email/${selected.id}/shopping-list`, { method: 'POST' });
      return res.json();
    }, 'Added to Shopping List');
  }

  async function handleDispatch() {
    if (!selected) return;
    await runAction('dispatch', async () => {
      const res = await fetch(`/api/v2/email/${selected.id}/dispatch`, { method: 'POST' });
      return res.json();
    }, 'Dispatch campaign created');
  }

  async function handleSendDraft(draft: V2EmailDraft) {
    if (sendingId || sentDraftIds.has(draft.id)) return;
    setSendingId(draft.id);
    setSendResult(null);
    try {
      const res = await fetch(draft.approveWebhook, { method: 'POST' });
      if (res.ok) {
        setSentDraftIds((prev) => new Set(prev).add(draft.id));
      }
      setSendResult({ id: draft.id, ok: res.ok });
    } catch {
      setSendResult({ id: draft.id, ok: false });
    } finally {
      setSendingId(null);
      setTimeout(() => setSendResult(null), 3000);
    }
  }

  async function handleComposeSend() {
    if (!selected || composeSending) return;
    setComposeSending(true);
    setComposeResult(null);
    try {
      const to = composeMode === 'forward' ? composeTo : undefined; // reply derives `to` server-side
      const res = await fetch(`/api/v2/email/${selected.id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bodyText: composeBody, ...(to ? { to } : {}) }),
      });
      const data = await res.json();
      if (res.ok) {
        setComposeResult({ ok: true, message: 'Sent successfully' });
        setTimeout(() => setComposeMode(null), 1500);
      } else {
        setComposeResult({ ok: false, message: data.error ?? 'Send failed' });
      }
    } catch (err) {
      setComposeResult({ ok: false, message: err instanceof Error ? err.message : 'Send failed' });
    } finally {
      setComposeSending(false);
    }
  }

  function handleOpenToneSelector() {
    setShowToneSelector(true);
    setSelectedTone(null);
  }

  function handleSelectTone(tone: string) {
    const draft = drafts.find((d) => d.tone === tone);
    if (draft) {
      setDraftEditorModal(draft);
      setEditingBody(draft.body);
      setShowToneSelector(false);
      setSelectedTone(null);
    }
    // If draft not found (e.g., Ruby Custom still generating), tone selector stays open
  }

  async function handleSendEditedDraft() {
    if (!draftEditorModal || sendingId || sentDraftIds.has(draftEditorModal.id)) return;
    setSendingId(draftEditorModal.id);
    setSendResult(null);
    try {
      const res = await fetch(draftEditorModal.approveWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overrideBody: editingBody }),
      });
      if (res.ok) {
        setSentDraftIds((prev) => new Set(prev).add(draftEditorModal.id));
        setDraftEditorModal(null);
        setEditingBody('');
      }
      setSendResult({ id: draftEditorModal.id, ok: res.ok });
      setTimeout(() => setSendResult(null), 3000);
    } catch {
      setSendResult({ id: draftEditorModal.id, ok: false });
    } finally {
      setSendingId(null);
    }
  }

  async function handleRunTriage() {
    if (triageRunning) return;
    setTriageRunning(true);
    try {
      await fetch('/api/v2/email/triage/run', { method: 'POST' });
      await mutateTriage();
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
      if (data.ok) setTimeout(() => mutateTriage(), 1000);
    } catch {
      setTriageActing((s) => ({ ...s, [id]: 'error' }));
    }
  }

  async function handleTriageDeny(id: string) {
    setTriageActing((s) => ({ ...s, [id]: 'loading' }));
    try {
      await fetch(`/api/v2/email/triage/${id}/deny`, { method: 'POST' });
      setTriageActing((s) => ({ ...s, [id]: 'done' }));
      setTimeout(() => mutateTriage(), 500);
    } catch {
      setTriageActing((s) => ({ ...s, [id]: 'error' }));
    }
  }

  function ActionBtn({
    actionKey, icon, label, onClick, danger,
  }: {
    actionKey: string;
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
    danger?: boolean;
  }) {
    const state = actionStates[actionKey] ?? 'idle';
    const msg = actionMessages[actionKey];
    const isLoading = state === 'loading';
    const isDone = state === 'done';
    const isError = state === 'error';
    return (
      <button
        type="button"
        disabled={isLoading}
        onClick={onClick}
        title={msg || label}
        className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all"
        style={{
          background: isError ? 'var(--color-peach)' : isDone ? 'var(--color-mint)' : danger ? 'rgba(255,80,80,0.08)' : 'var(--muted)',
          color: isError ? 'var(--color-peach-text)' : isDone ? 'var(--color-mint-text)' : danger ? '#ff5050' : 'var(--foreground)',
          border: '1px solid var(--border)',
          opacity: isLoading ? 0.6 : 1,
          cursor: isLoading ? 'wait' : 'pointer',
        }}
      >
        {icon}
        {isLoading ? '…' : isDone ? (msg || '✓') : isError ? '!' : label}
      </button>
    );
  }

  return (
    <div className="space-y-4">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold" style={{ color: 'var(--foreground)' }}>Email</h1>
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>Split-pane inbox with hybrid AI drafting from Ruby.</p>
        </div>
        <SlashCommandSheet commands={EMAIL_COMMANDS} label="email" />
      </div>

      {/* ── AGENT SUGGESTIONS ── */}
      {(triages.length > 0 || lastRunAt) && (
        <div
          className="rounded-3xl overflow-hidden"
          style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
        >
          <div className="flex items-center justify-between px-5 py-4">
            <button
              type="button"
              onClick={() => setTriageExpanded((v) => !v)}
              className="flex items-center gap-2 min-w-0"
            >
              <Sparkles className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--color-cyan)' }} />
              <span className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
                Agent Suggestions
              </span>
              {triages.length > 0 && (
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-medium flex-shrink-0"
                  style={{ background: 'var(--color-cyan)', color: '#0A0E1A' }}
                >
                  {triages.length}
                </span>
              )}
              {lastRunAt && (
                <span className="text-xs hidden sm:block" style={{ color: 'var(--muted-foreground)' }}>
                  — sorted {formatRelativeTime(lastRunAt)}
                </span>
              )}
            </button>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                disabled={triageRunning}
                onClick={handleRunTriage}
                className="rounded-full px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 transition-opacity hover:opacity-80 disabled:opacity-50"
                style={{ background: 'var(--muted)', color: 'var(--foreground)', border: '1px solid var(--border)' }}
              >
                <Sparkles className="w-3 h-3" />
                {triageRunning ? 'Sorting…' : 'Run now'}
              </button>
              <button
                type="button"
                onClick={() => setTriageExpanded((v) => !v)}
                className="p-1 rounded-full transition-opacity hover:opacity-70"
              >
                {triageExpanded
                  ? <ChevronUp className="w-4 h-4" style={{ color: 'var(--muted-foreground)' }} />
                  : <ChevronDown className="w-4 h-4" style={{ color: 'var(--muted-foreground)' }} />
                }
              </button>
            </div>
          </div>

          {triageExpanded && triages.length === 0 && (
            <div className="px-5 pb-4">
              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                {lastRunAt ? 'No pending suggestions — inbox is clean.' : 'No suggestions yet. Hit "Run now" to sort your inbox.'}
              </p>
            </div>
          )}
          {triageExpanded && triages.length > 0 && (
            <div className="px-4 pb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {triages.map((triage: V2EmailTriageItem) => {
                const meta = BUCKET_META[triage.bucket] ?? BUCKET_META.OTHER;
                const acting = triageActing[triage.id];
                const isLoading = acting === 'loading';
                const isDone = acting === 'done';
                const isError = acting === 'error';
                const count = triage.emailSummaries.length;
                return (
                  <div
                    key={triage.id}
                    className="rounded-2xl p-4 flex flex-col gap-3"
                    style={{ background: meta.cardBg, border: '1px solid var(--border)' }}
                  >
                    {/* Header row */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-base leading-none">{meta.icon}</span>
                        <span className="text-xs font-semibold truncate" style={{ color: 'var(--foreground)' }}>
                          {meta.label}
                        </span>
                      </div>
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-medium flex-shrink-0 flex items-center gap-1"
                        style={{ background: meta.agentColor, color: meta.agentTextColor }}
                      >
                        <Bot className="w-2.5 h-2.5" /> {triage.agentName}
                      </span>
                    </div>

                    {/* Recommendation */}
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--foreground)', opacity: 0.85 }}>
                      {triage.recommendation}
                    </p>

                    {/* Email list (collapsed) */}
                    <div className="space-y-1">
                      {triage.emailSummaries.slice(0, 3).map((em) => (
                        <div key={em.id} className="text-[11px] truncate" style={{ color: 'var(--muted-foreground)' }}>
                          · {em.subject}
                        </div>
                      ))}
                      {count > 3 && (
                        <div className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
                          · +{count - 3} more
                        </div>
                      )}
                    </div>

                    {/* Action row */}
                    <div className="flex items-center gap-2 mt-auto">
                      <button
                        type="button"
                        disabled={isLoading || isDone}
                        onClick={() => handleTriageApprove(triage.id)}
                        className="rounded-full px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 transition-opacity hover:opacity-85 disabled:opacity-50"
                        style={{
                          background: isDone ? 'var(--color-mint)' : isError ? 'rgba(255,80,80,0.12)' : meta.agentColor,
                          color: isDone ? 'var(--color-mint-text)' : isError ? '#ff5050' : meta.agentTextColor,
                        }}
                      >
                        {isLoading ? '…' : isDone ? 'Done ✓' : isError ? 'Retry' : triage.actionLabel}
                      </button>
                      {!isDone && (
                        <button
                          type="button"
                          disabled={isLoading}
                          onClick={() => handleTriageDeny(triage.id)}
                          className="rounded-full px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-70 disabled:opacity-40"
                          style={{ color: 'var(--muted-foreground)', border: '1px solid var(--border)' }}
                        >
                          Dismiss
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="grid gap-0 lg:grid-cols-[420px_1fr]" style={{ minHeight: 'calc(100vh - 200px)' }}>

        {/* ── LEFT PANE: Email List ── */}
        <div
          className={`rounded-3xl lg:rounded-r-none lg:rounded-l-3xl border-r-0 lg:border-r overflow-hidden flex-col ${showDetail ? 'hidden lg:flex' : 'flex'}`}
          style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
        >
          {/* Tabs */}
          <div className="flex items-center gap-2 px-4 pt-4 pb-2">
            {TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className="rounded-full px-3 py-1.5 text-xs font-medium transition-all"
                style={{
                  background: activeTab === tab ? 'var(--color-cyan)' : 'transparent',
                  color: activeTab === tab ? '#0A0E1A' : 'var(--muted-foreground)',
                  border: activeTab === tab ? 'none' : '1px solid var(--border)',
                }}
              >
                {tab}{tab === 'Inbox' ? ` (${inboxCount})` : ''}
              </button>
            ))}
          </div>

          {/* Email list */}
          <div className="flex-1 overflow-y-auto scrollbar-hide px-2 pb-2 space-y-1">
            {inbox.map((email) => {
              const isSelected = selected?.id === email.id;
              const senderName = extractSenderName(email.sender);
              return (
                <button
                  key={email.id}
                  type="button"
                  onClick={() => { setSelectedId(email.id); setShowDetail(true); }}
                  className="w-full text-left rounded-2xl px-3 py-3 transition-all"
                  style={{
                    background: isSelected ? 'rgba(0,217,255,0.06)' : 'transparent',
                    border: isSelected ? '1.5px solid var(--color-cyan)' : '1.5px solid transparent',
                  }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ background: email.isRead ? 'var(--border)' : 'var(--color-cyan)' }}
                      />
                      <span className="text-sm font-semibold truncate" style={{ color: 'var(--foreground)' }}>
                        {senderName}
                      </span>
                    </div>
                    <span className="text-[11px] flex-shrink-0 ml-2" style={{ color: 'var(--muted-foreground)' }}>
                      {formatTime(email.timestamp)}
                    </span>
                  </div>
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--foreground)' }}>
                    {email.subject}
                  </p>
                  <p className="text-xs truncate mt-0.5 leading-snug" style={{ color: 'var(--muted-foreground)' }}>
                    {email.snippet ?? email.preview}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-medium flex items-center gap-1"
                      style={{ background: 'var(--color-lavender)', color: 'var(--color-lavender-text)' }}
                    >
                      <Bot className="w-2.5 h-2.5" /> Ruby
                    </span>
                    {email.sourceIntegration !== 'Internal' && (
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                        style={{ background: 'var(--muted)', color: 'var(--muted-foreground)', border: '1px solid var(--border)' }}
                      >
                        {email.sourceIntegration}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
            {inbox.length === 0 && (
              <p className="text-sm p-4" style={{ color: 'var(--muted-foreground)' }}>No emails loaded.</p>
            )}
          </div>
        </div>

        {/* ── RIGHT PANE: Email Detail ── */}
        <div
          className={`rounded-3xl lg:rounded-l-none lg:rounded-r-3xl overflow-hidden flex-col ${showDetail ? 'flex' : 'hidden lg:flex'}`}
          style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
        >
          {/* Mobile back */}
          <button
            type="button"
            onClick={() => setShowDetail(false)}
            className="lg:hidden flex items-center gap-1.5 px-4 pt-4 pb-2 text-sm font-medium"
            style={{ color: 'var(--color-cyan)' }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back to Inbox
          </button>

          {selected ? (
            <div className="flex-1 overflow-y-auto p-5 space-y-5">

              {/* Header */}
              <div>
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-1">
                  <h2 className="text-lg font-semibold leading-tight" style={{ color: 'var(--foreground)' }}>
                    {selected.subject}
                  </h2>
                  {selected.gmailLink && (
                    <a
                      href={selected.gmailLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs flex-shrink-0 transition-opacity hover:opacity-70"
                      style={{ color: 'var(--color-cyan)' }}
                    >
                      <ExternalLink className="w-3.5 h-3.5" /> Open in Gmail
                    </a>
                  )}
                </div>
                <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                  From: {extractSenderName(selected.sender)} &lt;{extractEmail(selected.sender)}&gt; · {formatTime(selected.timestamp)}
                </p>
              </div>

              {/* Primary action row */}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setComposeMode(composeMode === 'reply' ? null : 'reply')}
                  className="rounded-full px-4 py-2 text-xs font-semibold flex items-center gap-1.5 transition-opacity hover:opacity-85"
                  style={{
                    background: composeMode === 'reply' ? 'var(--color-cyan)' : 'var(--color-purple)',
                    color: composeMode === 'reply' ? '#0A0E1A' : '#FFFFFF',
                  }}
                >
                  <Reply className="w-3.5 h-3.5" />
                  {composeMode === 'reply' ? 'Cancel Reply' : 'Reply'}
                </button>
                <button
                  type="button"
                  onClick={() => setComposeMode(composeMode === 'forward' ? null : 'forward')}
                  className="rounded-full px-4 py-2 text-xs font-medium flex items-center gap-1.5 transition-opacity hover:opacity-85"
                  style={{
                    background: composeMode === 'forward' ? 'var(--color-cyan)' : 'transparent',
                    color: composeMode === 'forward' ? '#0A0E1A' : 'var(--foreground)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <Forward className="w-3.5 h-3.5" />
                  {composeMode === 'forward' ? 'Cancel Forward' : 'Forward'}
                </button>
                <button
                  type="button"
                  onClick={handleOpenToneSelector}
                  className="rounded-full px-4 py-2 text-xs font-medium flex items-center gap-1.5 transition-opacity hover:opacity-85"
                  style={{ background: 'var(--color-lavender)', color: 'var(--color-lavender-text)', border: '1px solid rgba(0,0,0,0.04)' }}
                >
                  <Bot className="w-3.5 h-3.5" /> Write a response for this
                </button>
              </div>

              {/* Compose area */}
              {composeMode && (
                <div
                  className="rounded-2xl p-4 space-y-3"
                  style={{ background: 'var(--muted)', border: '1px solid var(--border)' }}
                >
                  {composeMode === 'forward' && (
                    <input
                      type="email"
                      placeholder="To:"
                      value={composeTo}
                      onChange={(e) => setComposeTo(e.target.value)}
                      className="w-full rounded-xl px-3 py-2 text-sm outline-none"
                      style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
                    />
                  )}
                  <textarea
                    rows={5}
                    placeholder={composeMode === 'forward' ? 'Add a message…' : `Reply to ${extractSenderName(selected.sender)}…`}
                    value={composeBody}
                    onChange={(e) => setComposeBody(e.target.value)}
                    className="w-full rounded-xl px-3 py-2 text-sm outline-none resize-none"
                    style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={composeSending || !composeBody.trim() || (composeMode === 'forward' && !composeTo.trim())}
                      onClick={handleComposeSend}
                      className="rounded-full px-4 py-2 text-xs font-semibold flex items-center gap-1.5 transition-opacity hover:opacity-85 disabled:opacity-40"
                      style={{ background: 'var(--color-purple)', color: '#FFFFFF' }}
                    >
                      <Send className="w-3.5 h-3.5" />
                      {composeSending ? 'Sending…' : 'Send'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setComposeMode(null)}
                      className="rounded-full px-3 py-2 text-xs font-medium flex items-center gap-1"
                      style={{ color: 'var(--muted-foreground)', border: '1px solid var(--border)' }}
                    >
                      <X className="w-3 h-3" /> Cancel
                    </button>
                    {composeResult && (
                      <span className="text-xs" style={{ color: composeResult.ok ? 'var(--color-mint-text)' : '#ff5050' }}>
                        {composeResult.message}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Email body */}
              <div
                className="rounded-2xl p-5 text-sm leading-relaxed"
                style={{ background: 'var(--color-peach)', color: '#0F1B35', border: '1px solid rgba(0,0,0,0.04)' }}
              >
                {selected.snippet ?? selected.preview}
              </div>

              {/* Secondary action grid */}
              <div>
                <p className="text-xs font-medium mb-2" style={{ color: 'var(--muted-foreground)' }}>Actions</p>
                <div className="flex flex-wrap gap-2">
                  <ActionBtn
                    actionKey="delete-unsubscribe"
                    icon={<><BellOff className="w-3 h-3" /><Trash2 className="w-3 h-3" /></>}
                    label="Unsub & Delete"
                    onClick={handleDeleteAndUnsubscribe}
                    danger
                  />
                  <ActionBtn
                    actionKey="delete"
                    icon={<Trash2 className="w-3 h-3" />}
                    label="Delete"
                    onClick={handleDelete}
                    danger
                  />
                  <ActionBtn
                    actionKey="unsubscribe"
                    icon={<BellOff className="w-3 h-3" />}
                    label="Unsubscribe"
                    onClick={handleUnsubscribe}
                  />
                  <ActionBtn
                    actionKey="task"
                    icon={<CheckSquare className="w-3 h-3" />}
                    label="Make Task"
                    onClick={() => handleMakeTask('task')}
                  />
                  <ActionBtn
                    actionKey="financial-task"
                    icon={<DollarSign className="w-3 h-3" />}
                    label="Financial Task"
                    onClick={() => handleMakeTask('financial')}
                  />
                  <ActionBtn
                    actionKey="vision"
                    icon={<Eye className="w-3 h-3" />}
                    label="Vision Board"
                    onClick={handleVisionBoard}
                  />
                  <ActionBtn
                    actionKey="calendar"
                    icon={<Calendar className="w-3 h-3" />}
                    label="Add to Calendar"
                    onClick={handleAddToCalendar}
                  />
                  <ActionBtn
                    actionKey="shopping"
                    icon={<ShoppingCart className="w-3 h-3" />}
                    label="Shopping List"
                    onClick={handleShoppingList}
                  />
                  <ActionBtn
                    actionKey="dispatch"
                    icon={<Zap className="w-3 h-3" />}
                    label="Dispatch Campaign"
                    onClick={handleDispatch}
                  />
                </div>
              </div>

              {/* Ruby's Draft Suggestions */}
              <div ref={draftsRef}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2 h-2 rounded-full" style={{ background: 'var(--color-cyan)' }} />
                  <h3 className="text-base font-semibold" style={{ color: 'var(--foreground)' }}>
                    Ruby&apos;s Draft Suggestions
                  </h3>
                  {draftStreamError && (
                    <span className="text-xs ml-auto" style={{ color: '#ff5050' }}>
                      {draftStreamError}
                    </span>
                  )}
                </div>
                <div className="space-y-3">
                  {drafts.map((draft) => {
                    const colors = DRAFT_COLORS[draft.tone] ?? DRAFT_COLORS.Enthusiastic;
                    const desc = DRAFT_DESCRIPTIONS[draft.tone] ?? { title: draft.tone, subtitle: '' };
                    const isSending = sendingId === draft.id;
                    const result = sendResult?.id === draft.id ? sendResult : null;
                    return (
                      <div
                        key={draft.id}
                        className="rounded-2xl p-4"
                        style={{
                          background: colors.bg,
                          border: '1px solid rgba(0,0,0,0.04)',
                        }}
                      >
                        <p className="text-sm font-semibold" style={{ color: colors.textColor }}>
                          {desc.title}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: colors.textColor, opacity: 0.75 }}>
                          {desc.subtitle}
                        </p>
                        <p className="text-xs mt-2 leading-relaxed whitespace-pre-wrap" style={{ color: colors.textColor, opacity: 0.85 }}>
                          {draft.body}
                        </p>
                        <div className="flex items-center gap-2 mt-3">
                          <button
                            type="button"
                            disabled={!!sendingId || sentDraftIds.has(draft.id)}
                            onClick={() => handleSendDraft(draft)}
                            className="rounded-full px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 transition-opacity hover:opacity-85 disabled:opacity-40"
                            style={{ background: 'rgba(0,0,0,0.12)', color: colors.textColor }}
                          >
                            <Send className="w-3 h-3" />
                            {isSending ? 'Sending…' : sentDraftIds.has(draft.id) ? 'Sent ✓' : result?.ok ? 'Sent ✓' : result ? 'Failed' : 'Send'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {drafts.length === 0 && (
                    <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
                      Ruby is preparing draft suggestions…
                    </p>
                  )}
                </div>
              </div>

            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>Select an email to view.</p>
            </div>
          )}
        </div>
      </div>

      {/* ── TONE SELECTOR MODAL ── */}
      {showToneSelector && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div
            className="rounded-2xl p-6 space-y-4 max-w-md w-full"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
          >
            <h3 className="text-lg font-semibold" style={{ color: 'var(--foreground)' }}>
              Select response tone
            </h3>
            <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
              Choose how you&apos;d like to respond to this email.
            </p>
            <div className="space-y-2">
              {[
                { tone: 'Enthusiastic', title: 'Enthusiastic & Collaborative', color: 'var(--color-mint)' },
                { tone: 'Measured', title: 'Professional & Measured', color: 'var(--color-sky)' },
                { tone: 'Decline', title: 'Polite Decline', color: 'var(--color-peach)' },
                { tone: 'Ruby Custom', title: 'Ruby Custom', color: 'var(--color-lavender)' },
              ].map(({ tone, title, color }) => {
                const isDraftReady = drafts.some((d) => d.tone === tone);
                const isRubyCustom = tone === 'Ruby Custom';
                const draftsLoading = draftsFeed === undefined;
                // Disable if: Ruby Custom not ready, OR template draft not ready because drafts haven't loaded yet
                const isDisabled = !isDraftReady && (isRubyCustom || draftsLoading);
                const loadingLabel = isRubyCustom ? 'Generating…' : draftsLoading ? 'Loading…' : null;
                return (
                  <button
                    key={tone}
                    type="button"
                    onClick={() => handleSelectTone(tone)}
                    disabled={isDisabled}
                    className="w-full text-left rounded-xl p-3 transition-all disabled:opacity-50 disabled:cursor-wait"
                    style={{
                      background: color,
                      border: selectedTone === tone ? '2px solid currentColor' : '1px solid rgba(0,0,0,0.04)',
                      opacity: selectedTone && selectedTone !== tone ? 0.5 : 1,
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-sm" style={{ color: 'var(--foreground)' }}>
                        {title}
                      </p>
                      {!isDraftReady && loadingLabel && (
                        <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                          {loadingLabel}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => setShowToneSelector(false)}
              className="w-full rounded-full px-4 py-2 text-xs font-medium"
              style={{ background: 'var(--muted)', color: 'var(--muted-foreground)', border: '1px solid var(--border)' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── DRAFT EDITOR MODAL ── */}
      {draftEditorModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div
            className="rounded-2xl p-6 space-y-4 max-w-2xl w-full max-h-[80vh] overflow-y-auto"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
          >
            <h3 className="text-lg font-semibold" style={{ color: 'var(--foreground)' }}>
              {DRAFT_DESCRIPTIONS[draftEditorModal.tone]?.title || draftEditorModal.tone}
            </h3>
            <textarea
              value={editingBody}
              onChange={(e) => setEditingBody(e.target.value)}
              rows={10}
              className="w-full rounded-xl px-3 py-2 text-sm outline-none resize-none"
              style={{ background: 'var(--muted)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={sendingId === draftEditorModal.id || sentDraftIds.has(draftEditorModal.id)}
                onClick={handleSendEditedDraft}
                className="rounded-full px-4 py-2 text-xs font-semibold flex items-center gap-1.5 transition-opacity hover:opacity-85 disabled:opacity-40"
                style={{ background: 'var(--color-purple)', color: '#FFFFFF' }}
              >
                <Send className="w-3 h-3" />
                {sendingId === draftEditorModal.id ? 'Sending…' : sentDraftIds.has(draftEditorModal.id) ? 'Sent ✓' : 'Send'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraftEditorModal(null);
                  setEditingBody('');
                }}
                className="rounded-full px-3 py-2 text-xs font-medium flex items-center gap-1"
                style={{ color: 'var(--muted-foreground)', border: '1px solid var(--border)' }}
              >
                <X className="w-3 h-3" /> Cancel
              </button>
              {sendResult?.id === draftEditorModal.id && (
                <span className="text-xs" style={{ color: sendResult.ok ? 'var(--color-mint-text)' : '#ff5050' }}>
                  {sendResult.ok ? 'Sent successfully' : 'Failed to send'}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
