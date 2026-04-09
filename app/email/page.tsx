'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { Star, Reply, Forward, Bot, MoreHorizontal, Trash2, Archive } from 'lucide-react';
import type { V2EmailDraft, V2EmailDraftFeed, V2EmailFeed } from '@/lib/v2/types';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const TABS = ['Inbox', 'Drafts', 'Sent'] as const;

const DRAFT_COLORS: Record<string, { bg: string; textColor: string }> = {
  Enthusiastic: { bg: 'var(--color-mint)', textColor: 'var(--color-mint-text)' },
  Measured:     { bg: 'var(--color-sky)',  textColor: 'var(--color-sky-text)' },
  Decline:      { bg: 'var(--color-peach)', textColor: 'var(--color-peach-text)' },
  'Ruby Custom': { bg: 'var(--color-lavender)', textColor: 'var(--color-lavender-text)' },
};

const DRAFT_DESCRIPTIONS: Record<string, { title: string; subtitle: string }> = {
  Enthusiastic: { title: 'Enthusiastic & Collaborative', subtitle: 'Express interest and propose next steps with warmth' },
  Measured:     { title: 'Professional & Measured', subtitle: 'Request more details before committing' },
  Decline:      { title: 'Polite Decline', subtitle: "Thank them but indicate this isn't the right fit" },
  'Ruby Custom': { title: 'Ruby Custom Draft', subtitle: 'AI-generated contextual response' },
};

function formatTime(timestamp: string) {
  const d = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function extractSenderName(sender: string) {
  // "Name <email>" → "Name", or just return as-is
  const match = sender.match(/^([^<]+)/);
  return match ? match[1].trim().replace(/^"(.*)"$/, '$1') : sender;
}

export default function EmailPage() {
  const { data } = useSWR<V2EmailFeed>('/api/v2/email', fetcher, { refreshInterval: 30000 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [liveDraft, setLiveDraft] = useState<V2EmailDraft | null>(null);
  const [activeTab, setActiveTab] = useState<typeof TABS[number]>('Inbox');
  const [showDetail, setShowDetail] = useState(false);

  const handleSelectEmail = (id: string) => {
    setSelectedId(id);
    setShowDetail(true);
  };

  const inbox = data?.inbox ?? [];

  const selected = useMemo(() => {
    if (selectedId) return inbox.find((item) => item.id === selectedId) ?? null;
    return inbox[0] ?? null;
  }, [inbox, selectedId]);

  useEffect(() => {
    if (!selected && inbox.length) {
      setSelectedId(inbox[0].id);
    }
  }, [inbox, selected]);

  const { data: draftsFeed } = useSWR<V2EmailDraftFeed>(
    selected ? `/api/v2/email/${selected.id}/ai-drafts` : null,
    fetcher,
    { refreshInterval: 20000 }
  );

  useEffect(() => {
    setLiveDraft(null);
    if (!selectedId) return;
    const stream = new EventSource(`/api/v2/stream/email/${selectedId}/drafts`);
    stream.addEventListener('draft.generated', (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data);
        setLiveDraft(payload.draft as V2EmailDraft);
      } catch (_) {}
    });
    return () => stream.close();
  }, [selectedId]);

  const drafts = useMemo(() => {
    const base = draftsFeed?.drafts ?? [];
    if (liveDraft && !base.some((item) => item.id === liveDraft.id)) {
      return [...base, liveDraft];
    }
    return base;
  }, [draftsFeed?.drafts, liveDraft]);

  const inboxCount = inbox.filter((e) => !e.isRead).length || inbox.length;

  return (
    <div className="space-y-4">
      {/* Heading */}
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold" style={{ color: 'var(--foreground)' }}>Email</h1>
        <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>Split-pane inbox with hybrid AI drafting from Ruby.</p>
      </div>

      <div className="grid gap-0 lg:grid-cols-[340px_1fr]" style={{ minHeight: 'calc(100vh - 200px)' }}>

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
                  onClick={() => handleSelectEmail(email.id)}
                  className="w-full text-left rounded-2xl px-3 py-3 transition-all"
                  style={{
                    background: isSelected ? 'rgba(0,217,255,0.06)' : 'transparent',
                    border: isSelected ? '1.5px solid var(--color-cyan)' : '1.5px solid transparent',
                  }}
                >
                  {/* Sender row */}
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
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {!email.isRead && <Star className="w-3 h-3" style={{ color: '#FFB800', fill: '#FFB800' }} />}
                      <span className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
                        {formatTime(email.timestamp)}
                      </span>
                    </div>
                  </div>

                  {/* Subject */}
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--foreground)' }}>
                    {email.subject}
                  </p>

                  {/* Preview */}
                  <p className="text-xs truncate mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                    {email.preview}
                  </p>

                  {/* Bot badge */}
                  <div className="flex items-center gap-2 mt-2">
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-medium flex items-center gap-1"
                      style={{ background: 'var(--color-lavender)', color: 'var(--color-lavender-text)' }}
                    >
                      <Bot className="w-2.5 h-2.5" /> Ruby
                    </span>
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
          className={`rounded-3xl lg:rounded-l-none lg:rounded-r-3xl overflow-hidden flex-col lg:[border-left:none] ${showDetail ? 'flex' : 'hidden lg:flex'}`}
          style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
        >
          {/* Back button: mobile only */}
          <button
            type="button"
            onClick={() => setShowDetail(false)}
            className="lg:hidden flex items-center gap-1.5 px-4 pt-4 pb-2 text-sm font-medium transition-opacity hover:opacity-70"
            style={{ color: 'var(--color-cyan)' }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back to Inbox
          </button>

          {selected ? (
            <div className="flex-1 overflow-y-auto p-5">
              {/* Subject + metadata */}
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-1">
                <h2 className="text-lg font-semibold" style={{ color: 'var(--foreground)' }}>
                  {selected.subject}
                </h2>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button className="p-1.5 rounded-lg transition-opacity hover:opacity-70" style={{ color: 'var(--muted-foreground)' }}>
                    <Star className="w-4 h-4" />
                  </button>
                  <button className="p-1.5 rounded-lg transition-opacity hover:opacity-70" style={{ color: 'var(--muted-foreground)' }}>
                    <Archive className="w-4 h-4" />
                  </button>
                  <button className="p-1.5 rounded-lg transition-opacity hover:opacity-70" style={{ color: 'var(--muted-foreground)' }}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <button className="p-1.5 rounded-lg transition-opacity hover:opacity-70" style={{ color: 'var(--muted-foreground)' }}>
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <p className="text-xs mb-4" style={{ color: 'var(--muted-foreground)' }}>
                From: {extractSenderName(selected.sender)} · {formatTime(selected.timestamp)}
              </p>

              {/* Action buttons */}
              <div className="flex flex-wrap items-center gap-2 mb-5">
                <button
                  className="rounded-full px-4 py-2 text-xs font-semibold flex items-center gap-1.5 transition-opacity hover:opacity-85"
                  style={{ background: 'var(--color-purple)', color: '#FFFFFF' }}
                >
                  <Reply className="w-3.5 h-3.5" /> Reply
                </button>
                <button
                  className="rounded-full px-4 py-2 text-xs font-medium flex items-center gap-1.5 transition-opacity hover:opacity-85"
                  style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--foreground)' }}
                >
                  <Forward className="w-3.5 h-3.5" /> Forward
                </button>
                <button
                  className="rounded-full px-4 py-2 text-xs font-medium flex items-center gap-1.5 transition-opacity hover:opacity-85"
                  style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--foreground)' }}
                >
                  <Bot className="w-3.5 h-3.5" /> Draft with Ruby
                </button>
              </div>

              {/* Email body — peach card */}
              <div
                className="rounded-2xl p-5 text-sm leading-relaxed"
                style={{ background: 'var(--color-peach)', color: '#0F1B35', border: '1px solid rgba(0,0,0,0.04)' }}
              >
                {selected.preview}
              </div>

              {/* Ruby's Draft Suggestions */}
              <div className="mt-6">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2 h-2 rounded-full" style={{ background: 'var(--color-cyan)' }} />
                  <h3 className="text-base font-semibold" style={{ color: 'var(--foreground)' }}>
                    Ruby&apos;s Draft Suggestions
                  </h3>
                </div>
                <div className="space-y-3">
                  {drafts.map((draft) => {
                    const colors = DRAFT_COLORS[draft.tone] ?? DRAFT_COLORS.Enthusiastic;
                    const desc = DRAFT_DESCRIPTIONS[draft.tone] ?? { title: draft.tone, subtitle: '' };
                    return (
                      <div
                        key={draft.id}
                        className="rounded-2xl p-4 cursor-pointer transition-opacity hover:opacity-85"
                        style={{ background: colors.bg, border: '1px solid rgba(0,0,0,0.04)' }}
                        onClick={async () => {
                          await fetch(draft.approveWebhook, { method: 'POST' });
                        }}
                      >
                        <p className="text-sm font-semibold" style={{ color: colors.textColor }}>
                          {desc.title}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: colors.textColor, opacity: 0.75 }}>
                          {desc.subtitle}
                        </p>
                      </div>
                    );
                  })}
                  {drafts.length === 0 && (
                    <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
                      Ruby is preparing draft suggestions...
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
    </div>
  );
}
