'use client';

import { useEffect, useState, useMemo } from 'react';
import useSWR from 'swr';
import { Calendar, Trash2, Send, ExternalLink, CheckCircle, XCircle, MessageSquare, ChevronRight, ArrowLeft } from 'lucide-react';
import type { V2EmailFeed, V2EmailItem } from '@/lib/v2/types';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

type EmailAction =
  | 'SCHEDULE'
  | 'REPLY'
  | 'RSVP'
  | 'UNSUBSCRIBE'
  | 'DELETE'
  | 'ARCHIVE'
  | 'CREATE_TASK'
  | 'DEFER';

type EmailRecommendation = {
  emailId: string;
  action: EmailAction;
  reasoning: string;
  details?: {
    suggestedTimes?: string[];
    draftReply?: string;
    taskTitle?: string;
  };
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
};

type FeedbackRule = {
  pattern: string;
  action: EmailAction;
  autoApprove: boolean;
  createdAt: string;
};

const ACTION_META: Record<EmailAction, { label: string; icon: any; color: string; description: string }> = {
  SCHEDULE:    { label: 'Schedule Meeting',      icon: Calendar,      color: '#38bdf8', description: 'Add to calendar and send confirmation' },
  REPLY:       { label: 'Send Reply',            icon: Send,          color: '#a78bfa', description: 'AI-drafted response ready to send' },
  RSVP:        { label: 'RSVP & Add to Calendar',icon: Calendar,      color: '#10b981', description: 'Accept invitation and block time' },
  UNSUBSCRIBE: { label: 'Unsubscribe & Delete',  icon: Trash2,        color: '#f59e0b', description: 'Remove from list and clear inbox' },
  DELETE:      { label: 'Delete',                icon: Trash2,        color: '#ef4444', description: 'Remove from inbox permanently' },
  ARCHIVE:     { label: 'Archive',               icon: ExternalLink,  color: '#64748b', description: 'Archive for later reference' },
  CREATE_TASK: { label: 'Create Task',           icon: CheckCircle,   color: '#ec4899', description: 'Add to task pool' },
  DEFER:       { label: 'Snooze',                icon: MessageSquare, color: '#8b5cf6', description: 'Remind me later' },
};

function generateRecommendation(email: V2EmailItem): EmailRecommendation {
  const subject = email.subject.toLowerCase();
  const snippet = (email.snippet || email.preview || '').toLowerCase();
  const combined = `${subject} ${snippet}`;

  if (combined.match(/schedule|meeting|call|zoom|teams|available|calendar/)) {
    return { emailId: email.id, action: 'SCHEDULE', reasoning: 'Meeting request detected.', details: { suggestedTimes: ['Thursday 2pm', 'Friday 10am'] }, confidence: 'HIGH' };
  }
  if (combined.match(/invitation|invite|rsvp|event|conference|webinar/)) {
    return { emailId: email.id, action: 'RSVP', reasoning: 'Event invitation.', confidence: 'HIGH' };
  }
  if (combined.match(/newsletter|unsubscribe|marketing|promo|sale|digest/)) {
    return { emailId: email.id, action: 'UNSUBSCRIBE', reasoning: 'Marketing email.', confidence: 'MEDIUM' };
  }
  if (combined.match(/can you|would you|let me know|following up|quick question/)) {
    return { emailId: email.id, action: 'REPLY', reasoning: 'Personal message requiring response.', details: { draftReply: 'Thanks for reaching out! Let me get back to you on this.' }, confidence: 'HIGH' };
  }
  return { emailId: email.id, action: 'ARCHIVE', reasoning: 'Standard message. Archive for later review.', confidence: 'LOW' };
}

function loadFeedbackRules(): FeedbackRule[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem('emailz_feedback_rules');
    return stored ? JSON.parse(stored) : [];
  } catch { return []; }
}

function saveFeedbackRules(rules: FeedbackRule[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('emailz_feedback_rules', JSON.stringify(rules));
}

export default function EmailzPage() {
  const { data } = useSWR<V2EmailFeed>('/api/v2/email', fetcher, { refreshInterval: 30000 });
  const [recommendations, setRecommendations] = useState<Map<string, EmailRecommendation>>(new Map());
  const [processing, setProcessing] = useState<Set<string>>(new Set());
  const [feedbackMode, setFeedbackMode] = useState<string | null>(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [rules, setRules] = useState<FeedbackRule[]>([]);
  const [selectedBucket, setSelectedBucket] = useState<EmailAction | null>(null);
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);

  const emails = useMemo(() => data?.inbox ?? [], [data?.inbox]);

  useEffect(() => { setRules(loadFeedbackRules()); }, []);

  useEffect(() => {
    if (emails.length === 0) return;

    const fetchRecommendations = async () => {
      const newRecs = new Map<string, EmailRecommendation>();
      for (const email of emails) {
        try {
          const response = await fetch('/api/v2/email/recommend', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
          });
          if (response.ok) {
            const json = await response.json();
            newRecs.set(email.id, json.ok && json.recommendation ? json.recommendation : generateRecommendation(email));
          } else {
            newRecs.set(email.id, generateRecommendation(email));
          }
        } catch {
          newRecs.set(email.id, generateRecommendation(email));
        }
      }
      setRecommendations(newRecs);
    };

    fetchRecommendations();
  }, [emails]);

  async function handleApprove(emailId: string, addFeedback = false) {
    setProcessing(prev => new Set(prev).add(emailId));
    await new Promise(resolve => setTimeout(resolve, 800));

    if (addFeedback && feedbackText.trim()) {
      const rec = recommendations.get(emailId);
      if (rec) {
        const newRule: FeedbackRule = {
          pattern: feedbackText,
          action: rec.action,
          autoApprove: feedbackText.toLowerCase().includes('auto') || feedbackText.toLowerCase().includes('moving forward'),
          createdAt: new Date().toISOString(),
        };
        const updated = [...rules, newRule];
        setRules(updated);
        saveFeedbackRules(updated);
      }
      setFeedbackText('');
      setFeedbackMode(null);
    }

    setProcessing(prev => { const next = new Set(prev); next.delete(emailId); return next; });
    setRecommendations(prev => { const next = new Map(prev); next.delete(emailId); return next; });
    if (selectedEmail === emailId) setSelectedEmail(null);
  }

  async function handleApproveAll(action: EmailAction) {
    const targets = emails.filter(e => recommendations.get(e.id)?.action === action);
    for (const email of targets) await handleApprove(email.id);
    setSelectedBucket(null);
  }

  function handleDeny(emailId: string) {
    setRecommendations(prev => { const next = new Map(prev); next.delete(emailId); return next; });
    if (selectedEmail === emailId) setSelectedEmail(null);
  }

  function handleDenyAll(action: EmailAction) {
    emails.filter(e => recommendations.get(e.id)?.action === action).forEach(e => handleDeny(e.id));
    setSelectedBucket(null);
  }

  const buckets = useMemo(() => {
    const grouped = new Map<EmailAction, V2EmailItem[]>();
    emails.forEach(email => {
      const rec = recommendations.get(email.id);
      if (!rec) return;
      grouped.set(rec.action, [...(grouped.get(rec.action) ?? []), email]);
    });
    return grouped;
  }, [emails, recommendations]);

  const totalPending = useMemo(() => Array.from(buckets.values()).reduce((sum, b) => sum + b.length, 0), [buckets]);

  // ── BUCKET OVERVIEW ────────────────────────────────────────────────────────
  if (!selectedBucket) {
    return (
      <div className="space-y-4 p-4 max-w-5xl mx-auto">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold" style={{ color: 'var(--foreground)' }}>
              Email Autopilot
            </h1>
            <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
              {emails.length === 0
                ? 'Loading emails…'
                : recommendations.size === 0
                ? 'Analyzing emails…'
                : `${totalPending} email${totalPending !== 1 ? 's' : ''} sorted into ${buckets.size} bucket${buckets.size !== 1 ? 's' : ''}`}
            </p>
          </div>
          {rules.length > 0 && (
            <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
              {rules.length} learned rule{rules.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>

        {buckets.size === 0 && recommendations.size > 0 && (
          <div className="rounded-3xl p-8 text-center" style={{ border: '1px solid var(--border)', background: 'var(--card)' }}>
            <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>All caught up! No pending actions.</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Array.from(buckets.entries()).map(([action, bucketEmails]) => {
            const meta = ACTION_META[action];
            const Icon = meta.icon;
            const highCount = bucketEmails.filter(e => recommendations.get(e.id)?.confidence === 'HIGH').length;
            const preview = bucketEmails.slice(0, 3);

            return (
              <div
                key={action}
                className="rounded-3xl p-5 cursor-pointer transition-opacity hover:opacity-90"
                style={{ border: `1px solid ${meta.color}40`, background: 'var(--card)' }}
                onClick={() => { setSelectedBucket(action); setSelectedEmail(null); }}
              >
                {/* Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `${meta.color}20` }}>
                      <Icon className="w-4 h-4" style={{ color: meta.color }} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{meta.label}</p>
                      <p className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>{meta.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-lg font-bold" style={{ color: meta.color }}>{bucketEmails.length}</span>
                    <ChevronRight className="w-4 h-4" style={{ color: 'var(--muted-foreground)' }} />
                  </div>
                </div>

                {/* Confidence bar */}
                {highCount > 0 && (
                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex-1 h-1 rounded-full" style={{ background: 'var(--muted)' }}>
                      <div className="h-1 rounded-full transition-all" style={{ width: `${(highCount / bucketEmails.length) * 100}%`, background: meta.color }} />
                    </div>
                    <span className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>{highCount} high confidence</span>
                  </div>
                )}

                {/* Email previews */}
                <div className="space-y-1.5 mb-3">
                  {preview.map(email => (
                    <div key={email.id} className="flex items-start gap-2">
                      <div className="w-1 h-1 rounded-full mt-1.5 flex-shrink-0" style={{ background: meta.color }} />
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{email.sender}</p>
                        <p className="text-[10px] truncate" style={{ color: 'var(--muted-foreground)' }}>{email.subject}</p>
                      </div>
                    </div>
                  ))}
                  {bucketEmails.length > 3 && (
                    <p className="text-[10px] pl-3" style={{ color: 'var(--muted-foreground)' }}>+{bucketEmails.length - 3} more</p>
                  )}
                </div>

                {/* Quick actions */}
                <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => handleApproveAll(action)}
                    className="rounded-full px-3 py-1.5 text-xs font-semibold flex items-center gap-1"
                    style={{ background: meta.color, color: '#fff' }}
                  >
                    <CheckCircle className="w-3 h-3" />
                    Approve All
                  </button>
                  <button
                    onClick={() => handleDenyAll(action)}
                    className="rounded-full px-3 py-1.5 text-xs"
                    style={{ border: '1px solid var(--border)' }}
                  >
                    <XCircle className="w-3 h-3 inline mr-1" />
                    Deny All
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {rules.length > 0 && (
          <details className="rounded-3xl p-4" style={{ border: '1px solid var(--border)', background: 'var(--card)' }}>
            <summary className="text-sm font-semibold cursor-pointer">Learned Rules ({rules.length})</summary>
            <div className="mt-3 space-y-2">
              {rules.map((rule, i) => (
                <div key={i} className="text-xs p-3 rounded-lg" style={{ background: 'var(--muted)' }}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2 py-0.5 rounded text-[10px]" style={{ background: rule.autoApprove ? '#10b98130' : '#64748b30', color: rule.autoApprove ? '#10b981' : '#64748b' }}>
                      {rule.autoApprove ? 'AUTO-APPROVE' : 'SUGGEST'}
                    </span>
                    <span style={{ color: 'var(--muted-foreground)' }}>→ {ACTION_META[rule.action].label}</span>
                  </div>
                  <p>{rule.pattern}</p>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    );
  }

  // ── BUCKET DETAIL VIEW ─────────────────────────────────────────────────────
  const bucketEmails = buckets.get(selectedBucket) ?? [];
  const meta = ACTION_META[selectedBucket];
  const Icon = meta.icon;
  const detailEmail = selectedEmail ? emails.find(e => e.id === selectedEmail) : null;
  const detailRec = selectedEmail ? recommendations.get(selectedEmail) : null;

  return (
    <div className="flex flex-col p-4 max-w-5xl mx-auto space-y-4" style={{ height: 'calc(100vh - 80px)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <button
          onClick={() => { setSelectedBucket(null); setSelectedEmail(null); }}
          className="rounded-full p-2 transition-opacity hover:opacity-70"
          style={{ border: '1px solid var(--border)' }}
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `${meta.color}20` }}>
          <Icon className="w-4 h-4" style={{ color: meta.color }} />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-semibold">{meta.label}</h1>
          <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{bucketEmails.length} email{bucketEmails.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => handleApproveAll(selectedBucket)}
          className="rounded-full px-4 py-2 text-xs font-semibold flex items-center gap-1"
          style={{ background: meta.color, color: '#fff' }}
        >
          <CheckCircle className="w-3 h-3" />
          Approve All
        </button>
        <button
          onClick={() => handleDenyAll(selectedBucket)}
          className="rounded-full px-4 py-2 text-xs"
          style={{ border: '1px solid var(--border)' }}
        >
          Deny All
        </button>
      </div>

      {/* Split: list + detail */}
      <div className="flex gap-4 flex-1 min-h-0 overflow-hidden">
        {/* Email list */}
        <div className="w-72 flex-shrink-0 space-y-2 overflow-y-auto pr-1">
          {bucketEmails.length === 0 && (
            <div className="rounded-2xl p-6 text-center" style={{ border: '1px solid var(--border)' }}>
              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>No emails in this bucket.</p>
            </div>
          )}
          {bucketEmails.map(email => {
            const rec = recommendations.get(email.id);
            const isSelected = selectedEmail === email.id;
            const isProcessing = processing.has(email.id);

            return (
              <div
                key={email.id}
                className="rounded-2xl p-3 cursor-pointer transition-all"
                style={{
                  border: `1px solid ${isSelected ? meta.color : 'var(--border)'}`,
                  background: isSelected ? `${meta.color}10` : 'var(--card)',
                  opacity: isProcessing ? 0.5 : 1,
                }}
                onClick={() => setSelectedEmail(isSelected ? null : email.id)}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold truncate">{email.sender}</p>
                    <p className="text-xs truncate" style={{ color: 'var(--muted-foreground)' }}>{email.subject}</p>
                    <p className="text-[10px] mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                      {new Date(email.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                  {rec && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full flex-shrink-0" style={{
                      background: rec.confidence === 'HIGH' ? '#10b98120' : '#64748b20',
                      color: rec.confidence === 'HIGH' ? '#10b981' : '#64748b',
                    }}>
                      {rec.confidence}
                    </span>
                  )}
                </div>
                <div className="flex gap-1.5" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => handleApprove(email.id)}
                    disabled={isProcessing}
                    className="rounded-full px-2.5 py-1 text-[10px] font-semibold"
                    style={{ background: meta.color, color: '#fff' }}
                  >
                    {isProcessing ? '…' : 'Approve'}
                  </button>
                  <button
                    onClick={() => handleDeny(email.id)}
                    disabled={isProcessing}
                    className="rounded-full px-2.5 py-1 text-[10px]"
                    style={{ border: '1px solid var(--border)' }}
                  >
                    Deny
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Detail panel */}
        <div className="flex-1 min-w-0 overflow-y-auto">
          {detailEmail && detailRec ? (
            <div className="rounded-3xl p-5 space-y-4" style={{ border: '1px solid var(--border)', background: 'var(--card)' }}>
              <div>
                <p className="font-semibold">{detailEmail.sender}</p>
                <p className="text-sm mt-1">{detailEmail.subject}</p>
                <p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>
                  {new Date(detailEmail.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </p>
              </div>
              <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
                {detailEmail.snippet || detailEmail.preview}
              </p>

              <div className="rounded-2xl p-4 space-y-3" style={{ background: `${meta.color}15`, border: `1px solid ${meta.color}40` }}>
                <div className="flex items-center gap-2">
                  <Icon className="w-4 h-4" style={{ color: meta.color }} />
                  <p className="text-sm font-semibold" style={{ color: meta.color }}>{meta.label}</p>
                  <span className="text-[10px] px-2 py-0.5 rounded-full" style={{
                    background: detailRec.confidence === 'HIGH' ? '#10b98130' : '#64748b30',
                    color: detailRec.confidence === 'HIGH' ? '#10b981' : '#64748b',
                  }}>
                    {detailRec.confidence}
                  </span>
                </div>
                <p className="text-xs">{detailRec.reasoning}</p>

                {detailRec.details?.suggestedTimes && (
                  <div className="flex gap-2 flex-wrap">
                    {detailRec.details.suggestedTimes.map((time, i) => (
                      <span key={i} className="text-xs px-2 py-1 rounded" style={{ background: 'var(--background)', border: '1px solid var(--border)' }}>{time}</span>
                    ))}
                  </div>
                )}

                {detailRec.details?.draftReply && (
                  <div className="text-xs p-3 rounded" style={{ background: 'var(--background)', fontStyle: 'italic' }}>
                    &ldquo;{detailRec.details.draftReply}&rdquo;
                  </div>
                )}

                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => handleApprove(detailEmail.id)}
                    disabled={processing.has(detailEmail.id)}
                    className="rounded-full px-4 py-2 text-xs font-semibold flex items-center gap-1"
                    style={{ background: meta.color, color: '#fff' }}
                  >
                    <CheckCircle className="w-3 h-3" />
                    {processing.has(detailEmail.id) ? 'Processing…' : 'Approve'}
                  </button>
                  <button
                    onClick={() => handleDeny(detailEmail.id)}
                    className="rounded-full px-4 py-2 text-xs"
                    style={{ border: '1px solid var(--border)' }}
                  >
                    <XCircle className="w-3 h-3 inline mr-1" />
                    Deny
                  </button>
                  <button
                    onClick={() => setFeedbackMode(feedbackMode === detailEmail.id ? null : detailEmail.id)}
                    className="rounded-full px-4 py-2 text-xs"
                    style={{ border: '1px solid var(--border)' }}
                  >
                    <MessageSquare className="w-3 h-3 inline mr-1" />
                    Add Feedback
                  </button>
                </div>

                {feedbackMode === detailEmail.id && (
                  <div className="pt-3 border-t" style={{ borderColor: `${meta.color}40` }}>
                    <textarea
                      value={feedbackText}
                      onChange={e => setFeedbackText(e.target.value)}
                      placeholder="e.g., 'Moving forward, auto-unsubscribe anything untouched for 6+ months'"
                      className="w-full p-3 text-xs rounded-lg resize-none"
                      style={{ background: 'var(--background)', border: '1px solid var(--border)' }}
                      rows={3}
                    />
                    <button
                      onClick={() => handleApprove(detailEmail.id, true)}
                      className="mt-2 rounded-full px-4 py-2 text-xs font-semibold"
                      style={{ background: meta.color, color: '#fff' }}
                    >
                      Approve with Feedback
                    </button>
                  </div>
                )}
              </div>

              {detailEmail.gmailLink && (
                <a href={detailEmail.gmailLink} target="_blank" rel="noreferrer" className="text-xs flex items-center gap-1" style={{ color: 'var(--color-cyan)' }}>
                  <ExternalLink className="w-3 h-3" />
                  Open in Gmail
                </a>
              )}
            </div>
          ) : (
            <div className="rounded-3xl p-8 text-center flex items-center justify-center" style={{ border: '1px dashed var(--border)', minHeight: '200px' }}>
              <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>Select an email to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
