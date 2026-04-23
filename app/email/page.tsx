'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import useSWR from 'swr';
import {
  Flame, Briefcase, DollarSign, Users, PartyPopper,
  ShoppingBag, Code2, BookOpen, Plane,
  CheckCircle, XCircle, MessageSquare, ChevronRight, ArrowLeft, ExternalLink, Calendar, Search,
  ListPlus, Trash2, Eye, UserX, Sparkles, Square, CheckSquare, Send, X,
} from 'lucide-react';
import type { V2EmailFeed, V2EmailItem } from '@/lib/v2/types';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

type EmailBucket =
  | 'ON_FIRE'
  | 'BUSINESS'
  | 'FINANCIAL'
  | 'MY_PEOPLE'
  | 'FUN_EVENTS'
  | 'SHOPPING_GIFTS'
  | 'TECH_PROJECTS'
  | 'GOOD_READS'
  | 'TRAVEL';

type EmailRecommendation = {
  emailId: string;
  bucket: EmailBucket;
  reasoning: string;
  details?: {
    suggestedTimes?: string[];
    draftReply?: string;
    taskTitle?: string;
  };
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
};

const BUCKET_META: Record<EmailBucket, { label: string; icon: any; color: string; description: string; action: string }> = {
  ON_FIRE:        { label: 'On Fire',        icon: Flame,        color: '#ef4444', description: 'Urgent — needs you today',                    action: '' },
  BUSINESS:       { label: 'Business',       icon: Briefcase,    color: '#38bdf8', description: 'Work, clients, professional',                 action: 'Reply / Task' },
  FINANCIAL:      { label: 'Financial',      icon: DollarSign,   color: '#10b981', description: 'Bills, invoices, banking',                   action: 'Review' },
  MY_PEOPLE:      { label: 'My People',      icon: Users,        color: '#a78bfa', description: 'Friends, family, real humans',               action: '' },
  FUN_EVENTS:     { label: 'Fun & Events',   icon: PartyPopper,  color: '#f472b6', description: 'Invites, parties, social plans',            action: 'RSVP + Calendar' },
  SHOPPING_GIFTS: { label: 'Shopping',       icon: ShoppingBag,  color: '#f59e0b', description: 'Orders, deals, gifts',                      action: 'View / Delete' },
  TECH_PROJECTS:  { label: 'Tech & Projects',icon: Code2,        color: '#06b6d4', description: 'GitHub, dev tools, side projects, tech events', action: 'Task / Archive' },
  GOOD_READS:     { label: 'Good Reads',     icon: BookOpen,     color: '#8b5cf6', description: 'Newsletters, articles, content',            action: 'Read / Unsub' },
  TRAVEL:         { label: 'Travel',         icon: Plane,        color: '#0ea5e9', description: 'Flights, hotels, itineraries',              action: 'Add to Calendar' },
};

type AgentKey = 'adrian' | 'ruby' | 'emerald' | 'adobe' | 'anchor';

const AGENTS: { key: AgentKey; name: string; tagline: string; color: string }[] = [
  { key: 'adrian',  name: 'Adrian',  tagline: 'Urgent triage, admin, marketing',  color: '#ef4444' },
  { key: 'ruby',    name: 'Ruby',    tagline: 'People, replies, relationships',   color: '#a78bfa' },
  { key: 'emerald', name: 'Emerald', tagline: 'Events, opportunities, calendar',  color: '#10b981' },
  { key: 'adobe',   name: 'Adobe',   tagline: 'Bills, finance, receipts',         color: '#f59e0b' },
  { key: 'anchor',  name: 'Anchor',  tagline: 'Deep research, long-form work',    color: '#0ea5e9' },
];

type AgentPickerTarget = { emailIds: string[]; bucket: EmailBucket | null };

// Ordered by priority for display
const BUCKET_ORDER: EmailBucket[] = [
  'ON_FIRE', 'MY_PEOPLE', 'BUSINESS', 'FUN_EVENTS', 'FINANCIAL',
  'TECH_PROJECTS', 'TRAVEL', 'SHOPPING_GIFTS', 'GOOD_READS',
];

function classify(email: V2EmailItem): EmailBucket {
  const s = `${email.subject} ${email.snippet || email.preview || ''} ${email.sender}`.toLowerCase();

  if (s.match(/urgent|asap|action required|immediately|critical|time.?sensitive|deadline/)) return 'ON_FIRE';
  if (s.match(/flight|hotel|reservation|booking|itinerary|airbnb|trip|check.?in|airline|travel/)) return 'TRAVEL';
  if (s.match(/invoice|payment|bill|receipt|transaction|bank|charge|subscription fee|renewal|invoice/)) return 'FINANCIAL';
  if (s.match(/party|invite|invitation|rsvp|event|gathering|birthday|wedding|celebration/)) return 'FUN_EVENTS';
  if (s.match(/github|deploy|npm|docker|vercel|aws|gcp|azure|pull request|issue|ci\/cd|tech event|hackathon|devops/)) return 'TECH_PROJECTS';
  if (s.match(/order|shipped|delivery|tracking|amazon|package|gift|shop|deal|sale|promo code/)) return 'SHOPPING_GIFTS';
  if (s.match(/newsletter|digest|weekly|roundup|article|read|edition|update from/)) return 'GOOD_READS';
  if (s.match(/contract|proposal|client|meeting|schedule|agenda|follow.?up|brief|report|project update/)) return 'BUSINESS';
  if (s.match(/hey|hi |hello|hope you|catching up|wanted to reach|family|friend|personal/)) return 'MY_PEOPLE';

  return 'BUSINESS';
}

function generateFallback(email: V2EmailItem): EmailRecommendation {
  return { emailId: email.id, bucket: classify(email), reasoning: 'Classified by keyword match.', confidence: 'MEDIUM' };
}

type ActionLink = { label: string; url: string };
type EmailBody = { html: string | null; text: string | null; actionLinks: ActionLink[] };

export default function EmailPage() {
  const { data } = useSWR<V2EmailFeed>('/api/v2/email', fetcher, { refreshInterval: 60000 });
  const [recommendations, setRecommendations] = useState<Map<string, EmailRecommendation>>(new Map());
  const [processing, setProcessing] = useState<Set<string>>(new Set());
  const [feedbackMode, setFeedbackMode] = useState<string | null>(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [selectedBucket, setSelectedBucket] = useState<EmailBucket | null>(null);
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [emailBodies, setEmailBodies] = useState<Map<string, EmailBody>>(new Map());
  const [bodyLoading, setBodyLoading] = useState<Set<string>>(new Set());
  const [expandedBodies, setExpandedBodies] = useState<Set<string>>(new Set());
  const [replyDrafts, setReplyDrafts] = useState<Map<string, string>>(new Map());
  const [sendingReply, setSendingReply] = useState<Set<string>>(new Set());
  const [replyError, setReplyError] = useState<Map<string, string>>(new Map());
  const [replySent, setReplySent] = useState<Set<string>>(new Set());
  const [selectedSearchIds, setSelectedSearchIds] = useState<Set<string>>(new Set());
  const [agentPickerTarget, setAgentPickerTarget] = useState<AgentPickerTarget | null>(null);
  const [agentPickerKey, setAgentPickerKey] = useState<AgentKey>('adrian');
  const [agentPickerNote, setAgentPickerNote] = useState('');
  const [agentPickerSending, setAgentPickerSending] = useState(false);
  const [agentPickerResult, setAgentPickerResult] = useState<string | null>(null);

  const emails = useMemo(() => data?.inbox ?? [], [data?.inbox]);
  const fetchedIds = useRef<Set<string>>(new Set());
  const dismissedIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (emails.length === 0) return;

    const emailsToFetch = emails.filter(e => !fetchedIds.current.has(e.id) && !dismissedIds.current.has(e.id));
    if (emailsToFetch.length === 0) return;

    emailsToFetch.forEach(e => fetchedIds.current.add(e.id));

    Promise.all(
      emailsToFetch.map(async (email) => {
        try {
          const res = await fetch('/api/v2/email/recommend', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
          });
          const json = res.ok ? await res.json() : null;
          const rec = json?.ok && json.recommendation ? json.recommendation : generateFallback(email);
          setRecommendations(prev => new Map(prev).set(email.id, rec));
        } catch {
          setRecommendations(prev => new Map(prev).set(email.id, generateFallback(email)));
        }
      })
    );
  }, [emails]);

  useEffect(() => {
    if (!selectedEmail) return;
    if (emailBodies.has(selectedEmail) || bodyLoading.has(selectedEmail)) return;
    setBodyLoading(prev => new Set(prev).add(selectedEmail));
    fetch(`/api/v2/email/${selectedEmail}`)
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (json?.ok) {
          setEmailBodies(prev => new Map(prev).set(selectedEmail, {
            html: json.html ?? null,
            text: json.text ?? null,
            actionLinks: json.actionLinks ?? [],
          }));
        }
      })
      .catch(() => {})
      .finally(() => setBodyLoading(prev => { const n = new Set(prev); n.delete(selectedEmail); return n; }));
  }, [selectedEmail]); // eslint-disable-line react-hooks/exhaustive-deps

  function openAgentPicker(target: AgentPickerTarget) {
    setAgentPickerTarget(target);
    setAgentPickerKey('adrian');
    setAgentPickerNote('');
    setAgentPickerResult(null);
  }

  function closeAgentPicker() {
    if (agentPickerSending) return;
    setAgentPickerTarget(null);
    setAgentPickerNote('');
    setAgentPickerResult(null);
  }

  async function submitAgentPicker() {
    if (!agentPickerTarget) return;
    const { emailIds, bucket } = agentPickerTarget;
    setAgentPickerSending(true);
    setAgentPickerResult(null);
    try {
      const summaries = emailIds
        .map(id => emails.find(e => e.id === id))
        .filter((e): e is V2EmailItem => !!e)
        .map(e => ({
          id: e.id,
          sender: e.sender,
          subject: e.subject,
          snippet: e.snippet || e.preview || '',
        }));
      const res = await fetch('/api/v2/agent-inbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentKey: agentPickerKey,
          note: agentPickerNote,
          emailIds,
          bucket,
          summaries,
        }),
      });
      const json = res.ok ? await res.json() : null;
      if (json?.ok) {
        const agent = AGENTS.find(a => a.key === agentPickerKey)?.name ?? agentPickerKey;
        setAgentPickerResult(`Sent ${emailIds.length} email${emailIds.length !== 1 ? 's' : ''} to ${agent}.`);
        setTimeout(() => { setAgentPickerTarget(null); setAgentPickerResult(null); }, 900);
      } else {
        const err = json?.error ?? 'Failed to send.';
        setAgentPickerResult(err);
      }
    } catch {
      setAgentPickerResult('Network error — not sent.');
    } finally {
      setAgentPickerSending(false);
    }
  }

  async function handleRSVP(emailId: string) {
    setProcessing(prev => new Set(prev).add(emailId));
    const body = emailBodies.get(emailId);
    const actionLinks = body?.actionLinks ?? [];
    try {
      const res = await fetch(`/api/v2/email/${emailId}/add-to-calendar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionLinks }),
      });
      const json = res.ok ? await res.json() : null;
      if (json?.ok) {
        if (json.htmlLink) window.open(json.htmlLink, '_blank');
        (json.rsvpLinks ?? []).slice(0, 3).forEach((link: { url: string }) => window.open(link.url, '_blank'));
      }
    } catch { /* ignore */ }
    setProcessing(prev => { const n = new Set(prev); n.delete(emailId); return n; });
    setRecommendations(prev => { const n = new Map(prev); n.delete(emailId); return n; });
    if (selectedEmail === emailId) setSelectedEmail(null);
  }

  async function handleApprove(emailId: string, withFeedback = false) {
    setProcessing(prev => new Set(prev).add(emailId));
    await new Promise(r => setTimeout(r, 600));

    if (withFeedback && feedbackText.trim()) {
      setFeedbackText('');
      setFeedbackMode(null);
    }

    dismissedIds.current.add(emailId);
    setProcessing(prev => { const n = new Set(prev); n.delete(emailId); return n; });
    setRecommendations(prev => { const n = new Map(prev); n.delete(emailId); return n; });
    if (selectedEmail === emailId) setSelectedEmail(null);
  }

  async function handleApproveAll(bucket: EmailBucket) {
    const targets = emails.filter(e => recommendations.get(e.id)?.bucket === bucket);
    for (const email of targets) await handleApprove(email.id);
    setSelectedBucket(null);
  }

  function dismissEmail(emailId: string) {
    dismissedIds.current.add(emailId);
    fetchedIds.current.delete(emailId);
    setRecommendations(prev => { const n = new Map(prev); n.delete(emailId); return n; });
    if (selectedEmail === emailId) setSelectedEmail(null);
  }

  function handleDeny(emailId: string) {
    dismissEmail(emailId);
  }

  function handleDenyAll(bucket: EmailBucket) {
    emails.filter(e => recommendations.get(e.id)?.bucket === bucket).forEach(e => dismissEmail(e.id));
    setSelectedBucket(null);
  }

  async function handleArchive(emailId: string) {
    const email = emails.find(e => e.id === emailId);
    dismissEmail(emailId);
    if (email?.sourceIntegration === 'Gmail') {
      await fetch(`/api/v2/email/${emailId}/archive`, { method: 'POST' }).catch(() => {});
    }
  }

  async function handleDelete(emailId: string) {
    const email = emails.find(e => e.id === emailId);
    dismissEmail(emailId);
    if (email?.sourceIntegration === 'Gmail') {
      await fetch(`/api/v2/email/${emailId}/delete`, { method: 'POST' }).catch(() => {});
    }
  }

  async function handleDeleteAll(bucket: EmailBucket) {
    const targets = emails.filter(e => recommendations.get(e.id)?.bucket === bucket);
    targets.forEach(e => dismissEmail(e.id));
    setSelectedBucket(null);
    await Promise.all(
      targets
        .filter(e => e.sourceIntegration === 'Gmail')
        .map(e => fetch(`/api/v2/email/${e.id}/delete`, { method: 'POST' }).catch(() => {}))
    );
  }

  async function handleUnsubscribeAll(bucket: EmailBucket) {
    const targets = emails.filter(e => recommendations.get(e.id)?.bucket === bucket);
    await Promise.all(
      targets.map(async e => {
        try {
          const res = await fetch(`/api/v2/email/${e.id}/unsubscribe`, { method: 'POST' });
          const json = res.ok ? await res.json() : null;
          if (json?.unsubscribeUrl) window.open(json.unsubscribeUrl, '_blank');
        } catch { /* ignore */ }
      })
    );
  }

  async function handleSendReply(emailId: string) {
    const rec = recommendations.get(emailId);
    const text = (replyDrafts.get(emailId) ?? rec?.details?.draftReply)?.trim();
    if (!text) return;
    setSendingReply(prev => new Set(prev).add(emailId));
    setReplyError(prev => { const n = new Map(prev); n.delete(emailId); return n; });
    try {
      const res = await fetch(`/api/v2/email/${emailId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bodyText: text }),
      });
      if (res.ok) {
        setReplySent(prev => new Set(prev).add(emailId));
        setTimeout(() => {
          setRecommendations(prev => { const n = new Map(prev); n.delete(emailId); return n; });
          fetchedIds.current.delete(emailId);
          setSelectedEmail(null);
        }, 1500);
      } else {
        const json = await res.json().catch(() => ({}));
        setReplyError(prev => new Map(prev).set(emailId, json.error ?? 'Failed to send reply'));
      }
    } catch {
      setReplyError(prev => new Map(prev).set(emailId, 'Network error — reply not sent'));
    } finally {
      setSendingReply(prev => { const n = new Set(prev); n.delete(emailId); return n; });
    }
  }

  async function handleCreateTask(emailId: string) {
    setProcessing(prev => new Set(prev).add(emailId));
    try {
      await fetch(`/api/v2/email/${emailId}/create-task`, { method: 'POST' });
    } catch { /* ignore */ }
    setProcessing(prev => { const n = new Set(prev); n.delete(emailId); return n; });
    setRecommendations(prev => { const n = new Map(prev); n.delete(emailId); return n; });
    if (selectedEmail === emailId) setSelectedEmail(null);
  }

  async function handleUnsubscribe(emailId: string) {
    setProcessing(prev => new Set(prev).add(emailId));
    try {
      const res = await fetch(`/api/v2/email/${emailId}/unsubscribe`, { method: 'POST' });
      const json = res.ok ? await res.json() : null;
      if (json?.unsubscribeUrl) window.open(json.unsubscribeUrl, '_blank');
    } catch { /* ignore */ }
    setProcessing(prev => { const n = new Set(prev); n.delete(emailId); return n; });
  }

  async function handleAddToShoppingList(emailId: string) {
    setProcessing(prev => new Set(prev).add(emailId));
    try {
      await fetch(`/api/v2/email/${emailId}/shopping-list`, { method: 'POST' });
    } catch { /* ignore */ }
    setProcessing(prev => { const n = new Set(prev); n.delete(emailId); return n; });
    setRecommendations(prev => { const n = new Map(prev); n.delete(emailId); return n; });
    if (selectedEmail === emailId) setSelectedEmail(null);
  }

  function toggleFullBody(emailId: string) {
    setExpandedBodies(prev => {
      const next = new Set(prev);
      if (next.has(emailId)) next.delete(emailId);
      else next.add(emailId);
      return next;
    });
  }

  const searchResults = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.toLowerCase();
    return emails.filter(e =>
      recommendations.has(e.id) && (
        e.sender.toLowerCase().includes(q) ||
        e.subject.toLowerCase().includes(q) ||
        (e.snippet || e.preview || '').toLowerCase().includes(q)
      )
    );
  }, [emails, search, recommendations]);

  useEffect(() => { setSelectedSearchIds(new Set()); }, [search]);

  const buckets = useMemo(() => {
    const grouped = new Map<EmailBucket, V2EmailItem[]>();
    emails.forEach(email => {
      const rec = recommendations.get(email.id);
      if (!rec) return;
      grouped.set(rec.bucket, [...(grouped.get(rec.bucket) ?? []), email]);
    });
    return grouped;
  }, [emails, recommendations]);

  const totalPending = useMemo(() => Array.from(buckets.values()).reduce((s, b) => s + b.length, 0), [buckets]);
  const orderedBuckets = BUCKET_ORDER.filter(b => buckets.has(b));

  // ── OVERVIEW ───────────────────────────────────────────────────────────────
  if (!selectedBucket) {
    return (
      <div className="space-y-4 p-4 max-w-5xl mx-auto">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold" style={{ color: 'var(--foreground)' }}>
              Email
            </h1>
            <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
              {emails.length === 0
                ? 'Loading emails…'
                : recommendations.size === 0
                ? `${emails.length} emails — classifying…`
                : `${totalPending} email${totalPending !== 1 ? 's' : ''} across ${buckets.size} bucket${buckets.size !== 1 ? 's' : ''}`}
            </p>
          </div>
        </div>

        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--muted-foreground)' }} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search sender, subject, or content…"
            className="w-full rounded-2xl pl-9 pr-4 py-2.5 text-sm"
            style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted-foreground)' }}>
              <XCircle className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Search results */}
        {searchResults && (
          <div className="space-y-2">
            {/* Header row: count + select-all + bulk actions */}
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
                {selectedSearchIds.size > 0 && ` · ${selectedSearchIds.size} selected`}
              </p>
              {searchResults.length > 0 && (
                <button
                  onClick={() => {
                    const allIds = new Set(searchResults.map(e => e.id));
                    const allSelected = searchResults.every(e => selectedSearchIds.has(e.id));
                    setSelectedSearchIds(allSelected ? new Set() : allIds);
                  }}
                  className="flex items-center gap-1 text-xs transition-opacity hover:opacity-70"
                  style={{ color: 'var(--muted-foreground)' }}
                >
                  {searchResults.every(e => selectedSearchIds.has(e.id))
                    ? <CheckSquare className="w-3.5 h-3.5" />
                    : <Square className="w-3.5 h-3.5" />}
                  {searchResults.every(e => selectedSearchIds.has(e.id)) ? 'Deselect All' : 'Select All'}
                </button>
              )}
              {selectedSearchIds.size > 0 && (
                <>
                  <button
                    onClick={async () => {
                      const ids = Array.from(selectedSearchIds);
                      ids.forEach(id => dismissEmail(id));
                      setSelectedSearchIds(new Set());
                      await Promise.all(ids.map(id => {
                        const e = emails.find(em => em.id === id);
                        return e?.sourceIntegration === 'Gmail'
                          ? fetch(`/api/v2/email/${id}/archive`, { method: 'POST' }).catch(() => {})
                          : Promise.resolve();
                      }));
                    }}
                    className="rounded-full px-2.5 py-1 text-xs flex items-center gap-1 transition-opacity hover:opacity-70"
                    style={{ border: '1px solid var(--border)' }}
                  >
                    <XCircle className="w-3 h-3" />
                    Archive
                  </button>
                  <button
                    onClick={async () => {
                      const ids = Array.from(selectedSearchIds);
                      ids.forEach(id => dismissEmail(id));
                      setSelectedSearchIds(new Set());
                      await Promise.all(ids.map(id => {
                        const e = emails.find(em => em.id === id);
                        return e?.sourceIntegration === 'Gmail'
                          ? fetch(`/api/v2/email/${id}/delete`, { method: 'POST' }).catch(() => {})
                          : Promise.resolve();
                      }));
                    }}
                    className="rounded-full px-2.5 py-1 text-xs flex items-center gap-1 transition-opacity hover:opacity-70"
                    style={{ border: '1px solid #ef444460', color: '#ef4444' }}
                  >
                    <Trash2 className="w-3 h-3" />
                    Delete
                  </button>
                  <button
                    onClick={async () => {
                      const ids = Array.from(selectedSearchIds);
                      setSelectedSearchIds(new Set());
                      await Promise.all(ids.map(async id => {
                        try {
                          const res = await fetch(`/api/v2/email/${id}/unsubscribe`, { method: 'POST' });
                          const json = res.ok ? await res.json() : null;
                          if (json?.unsubscribeUrl) window.open(json.unsubscribeUrl, '_blank');
                        } catch { /* ignore */ }
                      }));
                    }}
                    className="rounded-full px-2.5 py-1 text-xs flex items-center gap-1 transition-opacity hover:opacity-70"
                    style={{ border: '1px solid var(--border)' }}
                  >
                    <UserX className="w-3 h-3" />
                    Unsub
                  </button>
                  <button
                    onClick={() => openAgentPicker({ emailIds: Array.from(selectedSearchIds), bucket: null })}
                    className="rounded-full px-2.5 py-1 text-xs flex items-center gap-1 transition-opacity hover:opacity-70"
                    style={{ border: '1px solid var(--border)' }}
                  >
                    <Send className="w-3 h-3" />
                    Send to Agent
                  </button>
                </>
              )}
            </div>

            {searchResults.length === 0 && (
              <div className="rounded-2xl p-6 text-center" style={{ border: '1px solid var(--border)', background: 'var(--card)' }}>
                <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>No emails match &ldquo;{search}&rdquo;</p>
              </div>
            )}
            {searchResults.map(email => {
              const rec = recommendations.get(email.id);
              const bucket = rec?.bucket;
              const meta = bucket ? BUCKET_META[bucket] : null;
              const isChecked = selectedSearchIds.has(email.id);
              return (
                <div key={email.id} className="rounded-2xl p-3 flex items-start gap-3" style={{ border: `1px solid ${isChecked ? 'var(--color-cyan)' : 'var(--border)'}`, background: 'var(--card)' }}>
                  <button
                    onClick={() => setSelectedSearchIds(prev => {
                      const next = new Set(prev);
                      if (next.has(email.id)) next.delete(email.id); else next.add(email.id);
                      return next;
                    })}
                    className="flex-shrink-0 mt-0.5 transition-opacity hover:opacity-70"
                    style={{ color: isChecked ? 'var(--color-cyan)' : 'var(--muted-foreground)' }}
                  >
                    {isChecked ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                  </button>
                  {meta && (
                    <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: `${meta.color}20` }}>
                      <meta.icon className="w-3 h-3" style={{ color: meta.color }} />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold truncate">{email.sender}</p>
                    <p className="text-xs truncate" style={{ color: 'var(--muted-foreground)' }}>{email.subject}</p>
                    {(email.snippet || email.preview) && (
                      <p className="text-[10px] truncate mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{email.snippet || email.preview}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {meta && <span className="text-[10px]" style={{ color: meta.color }}>{meta.label}</span>}
                    <span className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
                      {new Date(email.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                    {email.gmailLink && (
                      <a href={email.gmailLink} target="_blank" rel="noreferrer" style={{ color: 'var(--muted-foreground)' }}>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!searchResults && buckets.size === 0 && recommendations.size > 0 && (
          <div className="rounded-3xl p-8 text-center" style={{ border: '1px solid var(--border)', background: 'var(--card)' }}>
            <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>All caught up.</p>
          </div>
        )}

        {!searchResults && <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {orderedBuckets.map(bucket => {
            const meta = BUCKET_META[bucket];
            const Icon = meta.icon;
            const bucketEmails = buckets.get(bucket)!;
            const highCount = bucketEmails.filter(e => recommendations.get(e.id)?.confidence === 'HIGH').length;
            const preview = bucketEmails.slice(0, 3);

            return (
              <div
                key={bucket}
                className="rounded-3xl p-5 cursor-pointer transition-opacity hover:opacity-90"
                style={{ border: `1px solid ${meta.color}40`, background: 'var(--card)' }}
                onClick={() => { setSelectedBucket(bucket); setSelectedEmail(null); }}
              >
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

                {highCount > 0 && (
                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex-1 h-1 rounded-full" style={{ background: 'var(--muted)' }}>
                      <div className="h-1 rounded-full transition-all" style={{ width: `${(highCount / bucketEmails.length) * 100}%`, background: meta.color }} />
                    </div>
                    <span className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>{highCount} high confidence</span>
                  </div>
                )}

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

                <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                  {meta.action && (
                    <button
                      onClick={() => handleApproveAll(bucket)}
                      className="rounded-full px-3 py-1.5 text-xs font-semibold flex items-center gap-1"
                      style={{ background: meta.color, color: '#fff' }}
                    >
                      <CheckCircle className="w-3 h-3" />
                      {meta.action}
                    </button>
                  )}
                  <button
                    onClick={() => { emails.filter(e => recommendations.get(e.id)?.bucket === bucket).forEach(e => handleArchive(e.id)); setSelectedBucket(null); }}
                    className="rounded-full px-3 py-1.5 text-xs"
                    style={{ border: '1px solid var(--border)' }}
                  >
                    <XCircle className="w-3 h-3 inline mr-1" />
                    Archive All
                  </button>
                  <button
                    onClick={() => handleDeleteAll(bucket)}
                    className="rounded-full px-3 py-1.5 text-xs"
                    style={{ border: '1px solid #ef444460', color: '#ef4444' }}
                  >
                    <Trash2 className="w-3 h-3 inline mr-1" />
                    Delete All
                  </button>
                  <button
                    onClick={() => handleUnsubscribeAll(bucket)}
                    className="rounded-full px-3 py-1.5 text-xs"
                    style={{ border: '1px solid var(--border)' }}
                  >
                    <UserX className="w-3 h-3 inline mr-1" />
                    Unsub All
                  </button>
                  <button
                    onClick={() => openAgentPicker({ emailIds: bucketEmails.map(e => e.id), bucket })}
                    className="rounded-full px-3 py-1.5 text-xs"
                    style={{ border: '1px solid var(--border)' }}
                  >
                    <Send className="w-3 h-3 inline mr-1" />
                    Send to Agent
                  </button>
                </div>
              </div>
            );
          })}
        </div>}
        {renderAgentPicker()}
      </div>
    );
  }

  // ── BUCKET DETAIL ──────────────────────────────────────────────────────────
  const bucketEmails = buckets.get(selectedBucket) ?? [];
  const meta = BUCKET_META[selectedBucket];
  const Icon = meta.icon;
  const detailEmail = selectedEmail ? emails.find(e => e.id === selectedEmail) : null;
  const detailRec = selectedEmail ? recommendations.get(selectedEmail) : null;
  const isFunEvents = selectedBucket === 'FUN_EVENTS';
  const isMyPeople = selectedBucket === 'MY_PEOPLE';

  return (
    <div className="flex flex-col p-4 max-w-5xl mx-auto space-y-4" style={{ height: 'calc(100vh - 80px)' }}>
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
        {meta.action && (
          <button
            onClick={() => handleApproveAll(selectedBucket)}
            className="rounded-full px-4 py-2 text-xs font-semibold flex items-center gap-1"
            style={{ background: meta.color, color: '#fff' }}
          >
            <CheckCircle className="w-3 h-3" />
            {meta.action} All
          </button>
        )}
        <button
          onClick={() => { bucketEmails.forEach(e => handleArchive(e.id)); setSelectedBucket(null); }}
          className="rounded-full px-4 py-2 text-xs"
          style={{ border: '1px solid var(--border)' }}
        >
          Archive All
        </button>
        <button
          onClick={() => handleDeleteAll(selectedBucket)}
          className="rounded-full px-4 py-2 text-xs"
          style={{ border: '1px solid #ef444460', color: '#ef4444' }}
        >
          <Trash2 className="w-3 h-3 inline mr-1" />
          Delete All
        </button>
        <button
          onClick={() => handleUnsubscribeAll(selectedBucket)}
          className="rounded-full px-4 py-2 text-xs"
          style={{ border: '1px solid var(--border)' }}
        >
          <UserX className="w-3 h-3 inline mr-1" />
          Unsub All
        </button>
        <button
          onClick={() => openAgentPicker({ emailIds: bucketEmails.map(e => e.id), bucket: selectedBucket })}
          className="rounded-full px-4 py-2 text-xs"
          style={{ border: '1px solid var(--border)' }}
        >
          <Send className="w-3 h-3 inline mr-1" />
          Send to Agent
        </button>
      </div>

      <div className="flex gap-4 flex-1 min-h-0 overflow-hidden">
        {/* Email list */}
        <div className="w-72 flex-shrink-0 space-y-2 overflow-y-auto pr-1">
          {bucketEmails.length === 0 && (
            <div className="rounded-2xl p-6 text-center" style={{ border: '1px solid var(--border)' }}>
              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>No emails here.</p>
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
                  {meta.action && (
                    <button
                      onClick={() => handleApprove(email.id)}
                      disabled={isProcessing}
                      className="rounded-full px-2.5 py-1 text-[10px] font-semibold"
                      style={{ background: meta.color, color: '#fff' }}
                    >
                      {isProcessing ? '…' : meta.action}
                    </button>
                  )}
                  <button
                    onClick={() => handleArchive(email.id)}
                    disabled={isProcessing}
                    className="rounded-full px-2.5 py-1 text-[10px]"
                    style={{ border: '1px solid var(--border)' }}
                    title="Archive"
                  >
                    Archive
                  </button>
                  <button
                    onClick={() => handleDelete(email.id)}
                    disabled={isProcessing}
                    className="rounded-full p-1 transition-opacity hover:opacity-70"
                    style={{ border: '1px solid var(--border)', color: '#ef4444' }}
                    title="Delete"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => openAgentPicker({ emailIds: [email.id], bucket: selectedBucket })}
                    disabled={isProcessing}
                    className="rounded-full p-1 transition-opacity hover:opacity-70"
                    style={{ border: '1px solid var(--border)' }}
                    title="Send to Agent"
                  >
                    <Send className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Detail panel */}
        <div className="flex-1 min-w-0 overflow-y-auto">
          {detailEmail && detailRec ? (() => {
            const body = emailBodies.get(detailEmail.id);
            const isLoadingBody = bodyLoading.has(detailEmail.id);
            const actionLinks = body?.actionLinks ?? [];

            return (
              <div className="rounded-3xl p-5 space-y-4" style={{ border: '1px solid var(--border)', background: 'var(--card)' }}>
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <p className="font-semibold">{detailEmail.sender}</p>
                      <p className="text-sm mt-1">{detailEmail.subject}</p>
                      <p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>
                        {new Date(detailEmail.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </p>
                    </div>
                    {detailEmail.gmailLink && (
                      <a
                        href={detailEmail.gmailLink}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs flex items-center gap-1 transition-opacity hover:opacity-70 flex-shrink-0"
                        style={{ color: meta.color }}
                      >
                        <ExternalLink className="w-3 h-3" />
                        Gmail
                      </a>
                    )}
                  </div>
                </div>
                <div>
                  {expandedBodies.has(detailEmail.id) && body ? (
                    <div className="text-sm space-y-2" style={{ color: 'var(--muted-foreground)' }}>
                      {body.text && (
                        <div className="whitespace-pre-wrap" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                          {body.text}
                        </div>
                      )}
                      {body.html && !body.text && (
                        <div
                          className="prose prose-sm max-w-none"
                          style={{ maxHeight: '400px', overflowY: 'auto' }}
                          dangerouslySetInnerHTML={{ __html: body.html }}
                        />
                      )}
                    </div>
                  ) : (
                    <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
                      {detailEmail.snippet || detailEmail.preview}
                    </p>
                  )}
                  {body && (
                    <button
                      onClick={() => toggleFullBody(detailEmail.id)}
                      className="text-xs mt-2 flex items-center gap-1 transition-opacity hover:opacity-70"
                      style={{ color: meta.color }}
                    >
                      <Eye className="w-3 h-3" />
                      {expandedBodies.has(detailEmail.id) ? 'Hide Full Email' : 'View Full Email'}
                    </button>
                  )}
                </div>

                {/* Action links extracted from email body */}
                {isLoadingBody && (
                  <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Scanning for action links…</p>
                )}
                {actionLinks.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold" style={{ color: 'var(--muted-foreground)' }}>Actions in this email</p>
                    <div className="flex flex-wrap gap-2">
                      {actionLinks.map((link, i) => (
                        <a
                          key={i}
                          href={link.url}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-full px-3 py-1.5 text-xs font-semibold flex items-center gap-1 transition-opacity hover:opacity-80"
                          style={{ background: `${meta.color}20`, color: meta.color, border: `1px solid ${meta.color}40` }}
                        >
                          <ExternalLink className="w-3 h-3" />
                          {link.label}
                        </a>
                      ))}
                    </div>
                  </div>
                )}

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
                    <span className="text-[10px] px-2 py-0.5 rounded-full" style={{
                      background: detailRec.reasoning.includes('keyword') ? '#f59e0b20' : '#3b82f620',
                      color: detailRec.reasoning.includes('keyword') ? '#f59e0b' : '#3b82f6',
                    }}>
                      {detailRec.reasoning.includes('keyword') ? 'Keyword' : 'AI'}
                    </span>
                  </div>
                  <p className="text-xs" style={{ color: detailRec.reasoning.includes('keyword') ? '#f59e0b' : 'inherit' }}>
                    {detailRec.reasoning}
                  </p>

                  {detailRec.details?.draftReply && (isMyPeople || selectedBucket === 'BUSINESS') && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold" style={{ color: 'var(--muted-foreground)' }}>Draft reply — edit before sending</p>
                      <textarea
                        value={replyDrafts.has(detailEmail.id) ? replyDrafts.get(detailEmail.id) : detailRec.details.draftReply}
                        onChange={e => setReplyDrafts(prev => new Map(prev).set(detailEmail.id, e.target.value))}
                        rows={4}
                        className="w-full text-xs p-3 rounded-lg resize-none outline-none"
                        style={{ background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
                      />
                      {replyError.get(detailEmail.id) && (
                        <p className="text-xs" style={{ color: '#ef4444' }}>{replyError.get(detailEmail.id)}</p>
                      )}
                      {replySent.has(detailEmail.id) ? (
                        <p className="text-xs font-medium" style={{ color: '#10b981' }}>Reply sent ✓</p>
                      ) : (
                        <button
                          onClick={() => handleSendReply(detailEmail.id)}
                          disabled={sendingReply.has(detailEmail.id) || !(replyDrafts.get(detailEmail.id) ?? detailRec.details.draftReply)?.trim()}
                          className="rounded-full px-4 py-2 text-xs font-semibold transition-opacity hover:opacity-80 disabled:opacity-40"
                          style={{ background: meta.color, color: '#fff' }}
                        >
                          {sendingReply.has(detailEmail.id) ? 'Sending…' : 'Send Reply'}
                        </button>
                      )}
                    </div>
                  )}

                  {detailRec.details?.suggestedTimes && isFunEvents && (
                    <div className="flex gap-2 flex-wrap">
                      {detailRec.details.suggestedTimes.map((time, i) => (
                        <span key={i} className="text-xs px-2 py-1 rounded" style={{ background: 'var(--background)', border: '1px solid var(--border)' }}>{time}</span>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2 flex-wrap">
                    {isFunEvents ? (
                      <button
                        onClick={() => handleRSVP(detailEmail.id)}
                        disabled={processing.has(detailEmail.id)}
                        className="rounded-full px-4 py-2 text-xs font-semibold flex items-center gap-1"
                        style={{ background: meta.color, color: '#fff' }}
                      >
                        <Calendar className="w-3 h-3" />
                        {processing.has(detailEmail.id) ? 'Adding to Calendar…' : 'RSVP + Add to Calendar'}
                      </button>
                    ) : meta.action ? (
                      <button
                        onClick={() => handleApprove(detailEmail.id)}
                        disabled={processing.has(detailEmail.id)}
                        className="rounded-full px-4 py-2 text-xs font-semibold flex items-center gap-1"
                        style={{ background: meta.color, color: '#fff' }}
                      >
                        <CheckCircle className="w-3 h-3" />
                        {processing.has(detailEmail.id) ? 'Processing…' : meta.action}
                      </button>
                    ) : null}
                    <button
                      onClick={() => handleArchive(detailEmail.id)}
                      className="rounded-full px-4 py-2 text-xs flex items-center gap-1"
                      style={{ border: '1px solid var(--border)' }}
                    >
                      <XCircle className="w-3 h-3" />
                      Archive
                    </button>
                    <button
                      onClick={() => handleDelete(detailEmail.id)}
                      className="rounded-full px-4 py-2 text-xs flex items-center gap-1 transition-opacity hover:opacity-70"
                      style={{ border: '1px solid #ef444460', color: '#ef4444' }}
                    >
                      <Trash2 className="w-3 h-3" />
                      Delete
                    </button>
                    {(selectedBucket === 'BUSINESS' || selectedBucket === 'TECH_PROJECTS') && (
                      <button
                        onClick={() => handleCreateTask(detailEmail.id)}
                        disabled={processing.has(detailEmail.id)}
                        className="rounded-full px-4 py-2 text-xs"
                        style={{ border: '1px solid var(--border)' }}
                      >
                        <ListPlus className="w-3 h-3 inline mr-1" />
                        Create Task
                      </button>
                    )}
                    {selectedBucket === 'SHOPPING_GIFTS' && (
                      <button
                        onClick={() => handleAddToShoppingList(detailEmail.id)}
                        disabled={processing.has(detailEmail.id)}
                        className="rounded-full px-4 py-2 text-xs"
                        style={{ border: '1px solid var(--border)' }}
                      >
                        <ShoppingBag className="w-3 h-3 inline mr-1" />
                        Add to List
                      </button>
                    )}
                    <button
                      onClick={() => handleUnsubscribe(detailEmail.id)}
                      disabled={processing.has(detailEmail.id)}
                      className="rounded-full px-4 py-2 text-xs"
                      style={{ border: '1px solid var(--border)' }}
                    >
                      <UserX className="w-3 h-3 inline mr-1" />
                      Unsubscribe
                    </button>
                    <button
                      onClick={() => openAgentPicker({ emailIds: [detailEmail.id], bucket: selectedBucket })}
                      className="rounded-full px-4 py-2 text-xs"
                      style={{ border: '1px solid var(--border)' }}
                    >
                      <Send className="w-3 h-3 inline mr-1" />
                      Send to Agent
                    </button>
                    <button
                      onClick={() => setFeedbackMode(feedbackMode === detailEmail.id ? null : detailEmail.id)}
                      className="rounded-full px-4 py-2 text-xs"
                      style={{ border: '1px solid var(--border)' }}
                    >
                      <MessageSquare className="w-3 h-3 inline mr-1" />
                      Feedback
                    </button>
                  </div>

                  {feedbackMode === detailEmail.id && (
                    <div className="pt-3 border-t" style={{ borderColor: `${meta.color}40` }}>
                      <textarea
                        value={feedbackText}
                        onChange={e => setFeedbackText(e.target.value)}
                        placeholder="e.g. 'This is actually from a friend, move to My People'"
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
            );
          })() : (
            <div className="rounded-3xl p-8 text-center flex items-center justify-center" style={{ border: '1px dashed var(--border)', minHeight: '200px' }}>
              <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>Select an email to view details</p>
            </div>
          )}
        </div>
      </div>
      {renderAgentPicker()}
    </div>
  );

  function renderAgentPicker() {
    if (!agentPickerTarget) return null;
    const count = agentPickerTarget.emailIds.length;
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.5)' }}
        onClick={closeAgentPicker}
      >
        <div
          className="rounded-3xl p-5 w-full max-w-md space-y-4"
          style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-semibold">Send to Agent</h3>
              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                {count} email{count !== 1 ? 's' : ''}
                {agentPickerTarget.bucket ? ` · ${BUCKET_META[agentPickerTarget.bucket].label}` : ''}
              </p>
            </div>
            <button
              onClick={closeAgentPicker}
              disabled={agentPickerSending}
              className="rounded-full p-1 transition-opacity hover:opacity-70"
              style={{ color: 'var(--muted-foreground)' }}
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold" style={{ color: 'var(--muted-foreground)' }}>Pick an agent</p>
            <div className="grid grid-cols-1 gap-2">
              {AGENTS.map(agent => {
                const isActive = agent.key === agentPickerKey;
                return (
                  <button
                    key={agent.key}
                    onClick={() => setAgentPickerKey(agent.key)}
                    disabled={agentPickerSending}
                    className="rounded-2xl p-3 text-left transition-all"
                    style={{
                      border: `1px solid ${isActive ? agent.color : 'var(--border)'}`,
                      background: isActive ? `${agent.color}15` : 'var(--background)',
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `${agent.color}25` }}>
                        <Sparkles className="w-3 h-3" style={{ color: agent.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold">{agent.name}</p>
                        <p className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>{agent.tagline}</p>
                      </div>
                      {isActive && <CheckCircle className="w-4 h-4" style={{ color: agent.color }} />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold" style={{ color: 'var(--muted-foreground)' }}>Note for the agent</p>
            <textarea
              value={agentPickerNote}
              onChange={e => setAgentPickerNote(e.target.value)}
              disabled={agentPickerSending}
              placeholder="e.g. 'Draft a polite decline and flag anything urgent.'"
              className="w-full text-xs p-3 rounded-lg resize-none outline-none"
              style={{ background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
              rows={3}
            />
          </div>

          {agentPickerResult && (
            <p className="text-xs" style={{ color: agentPickerResult.startsWith('Sent') ? '#10b981' : '#ef4444' }}>
              {agentPickerResult}
            </p>
          )}

          <div className="flex gap-2 justify-end">
            <button
              onClick={closeAgentPicker}
              disabled={agentPickerSending}
              className="rounded-full px-4 py-2 text-xs"
              style={{ border: '1px solid var(--border)' }}
            >
              Cancel
            </button>
            <button
              onClick={submitAgentPicker}
              disabled={agentPickerSending}
              className="rounded-full px-4 py-2 text-xs font-semibold flex items-center gap-1"
              style={{ background: AGENTS.find(a => a.key === agentPickerKey)?.color ?? '#0ea5e9', color: '#fff' }}
            >
              <Send className="w-3 h-3" />
              {agentPickerSending ? 'Sending…' : 'Send to Inbox'}
            </button>
          </div>
        </div>
      </div>
    );
  }
}
