'use client';

import { useEffect, useState, useMemo } from 'react';
import useSWR from 'swr';
import { Bot, Calendar, Trash2, Send, ExternalLink, CheckCircle, XCircle, MessageSquare } from 'lucide-react';
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

// Action metadata
const ACTION_META: Record<EmailAction, { label: string; icon: any; color: string; description: string }> = {
  SCHEDULE: { label: 'Schedule Meeting', icon: Calendar, color: '#38bdf8', description: 'Add to calendar and send confirmation' },
  REPLY: { label: 'Send Reply', icon: Send, color: '#a78bfa', description: 'AI-drafted response' },
  RSVP: { label: 'RSVP & Add to Calendar', icon: Calendar, color: '#10b981', description: 'Accept invitation' },
  UNSUBSCRIBE: { label: 'Unsubscribe & Delete', icon: Trash2, color: '#f59e0b', description: 'Remove from list' },
  DELETE: { label: 'Delete', icon: Trash2, color: '#ef4444', description: 'Remove from inbox' },
  ARCHIVE: { label: 'Archive', icon: ExternalLink, color: '#64748b', description: 'Archive for later' },
  CREATE_TASK: { label: 'Create Task', icon: CheckCircle, color: '#ec4899', description: 'Add to task pool' },
  DEFER: { label: 'Snooze', icon: MessageSquare, color: '#8b5cf6', description: 'Remind me later' },
};

// Simple AI recommendation logic (will be replaced with OpenClaw later)
function generateRecommendation(email: V2EmailItem): EmailRecommendation {
  const subject = email.subject.toLowerCase();
  const snippet = (email.snippet || email.preview || '').toLowerCase();
  const combined = `${subject} ${snippet}`;

  // Check for meeting requests
  if (combined.match(/schedule|meeting|call|zoom|teams|available|calendar/)) {
    return {
      emailId: email.id,
      action: 'SCHEDULE',
      reasoning: 'Meeting request detected. Scheduling will help move this forward.',
      details: { suggestedTimes: ['Thursday 2pm', 'Friday 10am'] },
      confidence: 'HIGH',
    };
  }

  // Check for events
  if (combined.match(/invitation|invite|rsvp|event|conference|webinar/)) {
    return {
      emailId: email.id,
      action: 'RSVP',
      reasoning: 'Event invitation. RSVP to confirm attendance.',
      confidence: 'HIGH',
    };
  }

  // Check for newsletters/marketing (no recent engagement)
  if (combined.match(/newsletter|unsubscribe|marketing|promo|sale|digest/)) {
    return {
      emailId: email.id,
      action: 'UNSUBSCRIBE',
      reasoning: 'Marketing email with no recent engagement. Clear the noise?',
      confidence: 'MEDIUM',
    };
  }

  // Check for personal/requires reply
  if (combined.match(/can you|would you|let me know|following up|quick question/)) {
    return {
      emailId: email.id,
      action: 'REPLY',
      reasoning: 'Personal message requiring response.',
      details: { draftReply: 'Thanks for reaching out! Let me get back to you on this.' },
      confidence: 'HIGH',
    };
  }

  // Default: Archive for review
  return {
    emailId: email.id,
    action: 'ARCHIVE',
    reasoning: 'Standard message. Archive for later review.',
    confidence: 'LOW',
  };
}

// Load rules from localStorage
function loadFeedbackRules(): FeedbackRule[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem('emailz_feedback_rules');
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

// Save rules to localStorage
function saveFeedbackRules(rules: FeedbackRule[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('emailz_feedback_rules', JSON.stringify(rules));
}

export default function EmailzPage() {
  const { data, mutate } = useSWR<V2EmailFeed>('/api/v2/email', fetcher, { refreshInterval: 30000 });
  const [recommendations, setRecommendations] = useState<Map<string, EmailRecommendation>>(new Map());
  const [processing, setProcessing] = useState<Set<string>>(new Set());
  const [feedbackMode, setFeedbackMode] = useState<string | null>(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [rules, setRules] = useState<FeedbackRule[]>([]);

  const emails = useMemo(() => data?.inbox ?? [], [data?.inbox]);

  // Load feedback rules on mount
  useEffect(() => {
    setRules(loadFeedbackRules());
  }, []);

  // Generate AI recommendations when emails load
  useEffect(() => {
    if (emails.length === 0) return;

    const fetchRecommendations = async () => {
      const newRecs = new Map<string, EmailRecommendation>();

      // Fetch recommendations for each email
      for (const email of emails) {
        try {
          const response = await fetch('/api/v2/email/recommend', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
          });

          if (response.ok) {
            const data = await response.json();
            if (data.ok && data.recommendation) {
              newRecs.set(email.id, data.recommendation);
            }
          } else {
            // Fallback to local recommendation on error
            newRecs.set(email.id, generateRecommendation(email));
          }
        } catch (error) {
          console.error('[emailz] Failed to get AI recommendation:', error);
          newRecs.set(email.id, generateRecommendation(email));
        }
      }

      setRecommendations(newRecs);
    };

    fetchRecommendations();
  }, [emails]);

  async function handleApprove(emailId: string, addFeedback: boolean = false) {
    setProcessing(prev => new Set(prev).add(emailId));

    // Simulate action execution
    await new Promise(resolve => setTimeout(resolve, 1000));

    if (addFeedback && feedbackText.trim()) {
      // Parse feedback and create rule
      const recommendation = recommendations.get(emailId);
      if (recommendation) {
        const newRule: FeedbackRule = {
          pattern: feedbackText,
          action: recommendation.action,
          autoApprove: feedbackText.toLowerCase().includes('auto') || feedbackText.toLowerCase().includes('moving forward'),
          createdAt: new Date().toISOString(),
        };
        const updatedRules = [...rules, newRule];
        setRules(updatedRules);
        saveFeedbackRules(updatedRules);
      }
      setFeedbackText('');
      setFeedbackMode(null);
    }

    setProcessing(prev => {
      const next = new Set(prev);
      next.delete(emailId);
      return next;
    });

    // Remove from recommendations
    setRecommendations(prev => {
      const next = new Map(prev);
      next.delete(emailId);
      return next;
    });
  }

  async function handleDeny(emailId: string) {
    setRecommendations(prev => {
      const next = new Map(prev);
      next.delete(emailId);
      return next;
    });
  }

  const pendingEmails = emails.filter(email => recommendations.has(email.id));

  return (
    <div className="space-y-4 p-4 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold" style={{ color: 'var(--foreground)' }}>
            Email Autopilot
          </h1>
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
            AI-recommended actions for {pendingEmails.length} emails
          </p>
        </div>
        {rules.length > 0 && (
          <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
            {rules.length} learned rule{rules.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {pendingEmails.length === 0 && (
        <div className="rounded-3xl p-8 text-center" style={{ border: '1px solid var(--border)', background: 'var(--card)' }}>
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
            All caught up! No pending email actions.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {pendingEmails.map((email) => {
          const recommendation = recommendations.get(email.id);
          if (!recommendation) return null;

          const meta = ACTION_META[recommendation.action];
          const Icon = meta.icon;
          const isProcessing = processing.has(email.id);
          const showFeedback = feedbackMode === email.id;

          return (
            <div
              key={email.id}
              className="rounded-3xl p-5 space-y-4"
              style={{
                border: '1px solid var(--border)',
                background: 'var(--card)',
                opacity: isProcessing ? 0.6 : 1,
              }}
            >
              {/* Email Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono px-2 py-0.5 rounded" style={{ background: 'var(--muted)' }}>
                      {email.sourceIntegration}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                      {new Date(email.timestamp).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>
                  <p className="font-semibold text-sm mb-1">{email.sender}</p>
                  <p className="text-sm mb-1">{email.subject}</p>
                  <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                    {email.snippet || email.preview}
                  </p>
                </div>
                {email.gmailLink && (
                  <a
                    href={email.gmailLink}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs flex items-center gap-1"
                    style={{ color: 'var(--color-cyan)' }}
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>

              {/* AI Recommendation */}
              <div
                className="rounded-2xl p-4 space-y-3"
                style={{
                  background: `${meta.color}15`,
                  border: `1px solid ${meta.color}40`,
                }}
              >
                <div className="flex items-start gap-3">
                  <Icon className="w-5 h-5 mt-0.5" style={{ color: meta.color }} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-semibold" style={{ color: meta.color }}>
                        {meta.label}
                      </p>
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-full"
                        style={{
                          background: recommendation.confidence === 'HIGH' ? '#10b98130' : '#64748b30',
                          color: recommendation.confidence === 'HIGH' ? '#10b981' : '#64748b',
                        }}
                      >
                        {recommendation.confidence}
                      </span>
                    </div>
                    <p className="text-xs mb-2" style={{ color: 'var(--foreground)' }}>
                      {recommendation.reasoning}
                    </p>

                    {/* Action Details */}
                    {recommendation.details?.suggestedTimes && (
                      <div className="flex gap-2 flex-wrap">
                        {recommendation.details.suggestedTimes.map((time, i) => (
                          <span
                            key={i}
                            className="text-xs px-2 py-1 rounded"
                            style={{ background: 'var(--background)', border: '1px solid var(--border)' }}
                          >
                            {time}
                          </span>
                        ))}
                      </div>
                    )}

                    {recommendation.details?.draftReply && (
                      <div
                        className="text-xs p-3 rounded mt-2"
                        style={{ background: 'var(--background)', fontStyle: 'italic' }}
                      >
                        &ldquo;{recommendation.details.draftReply}&rdquo;
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => handleApprove(email.id)}
                    disabled={isProcessing}
                    className="rounded-full px-4 py-2 text-xs font-semibold flex items-center gap-1"
                    style={{ background: meta.color, color: '#fff' }}
                  >
                    <CheckCircle className="w-3 h-3" />
                    {isProcessing ? 'Processing...' : 'Approve'}
                  </button>
                  <button
                    onClick={() => handleDeny(email.id)}
                    disabled={isProcessing}
                    className="rounded-full px-4 py-2 text-xs"
                    style={{ border: '1px solid var(--border)' }}
                  >
                    <XCircle className="w-3 h-3 inline mr-1" />
                    Deny
                  </button>
                  <button
                    onClick={() => setFeedbackMode(showFeedback ? null : email.id)}
                    className="rounded-full px-4 py-2 text-xs"
                    style={{ border: '1px solid var(--border)' }}
                  >
                    <MessageSquare className="w-3 h-3 inline mr-1" />
                    Add Feedback
                  </button>
                </div>

                {/* Feedback Input */}
                {showFeedback && (
                  <div className="pt-3 border-t" style={{ borderColor: `${meta.color}40` }}>
                    <textarea
                      value={feedbackText}
                      onChange={(e) => setFeedbackText(e.target.value)}
                      placeholder="e.g., 'Moving forward, auto-unsubscribe anything untouched for 6+ months'"
                      className="w-full p-3 text-xs rounded-lg resize-none"
                      style={{ background: 'var(--background)', border: '1px solid var(--border)' }}
                      rows={3}
                    />
                    <button
                      onClick={() => handleApprove(email.id, true)}
                      className="mt-2 rounded-full px-4 py-2 text-xs font-semibold"
                      style={{ background: meta.color, color: '#fff' }}
                    >
                      Approve with Feedback
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Learning Rules */}
      {rules.length > 0 && (
        <details className="rounded-3xl p-4" style={{ border: '1px solid var(--border)', background: 'var(--card)' }}>
          <summary className="text-sm font-semibold cursor-pointer">
            Learned Rules ({rules.length})
          </summary>
          <div className="mt-3 space-y-2">
            {rules.map((rule, i) => (
              <div
                key={i}
                className="text-xs p-3 rounded-lg"
                style={{ background: 'var(--muted)' }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="px-2 py-0.5 rounded text-[10px]"
                    style={{
                      background: rule.autoApprove ? '#10b98130' : '#64748b30',
                      color: rule.autoApprove ? '#10b981' : '#64748b',
                    }}
                  >
                    {rule.autoApprove ? 'AUTO-APPROVE' : 'SUGGEST'}
                  </span>
                  <span style={{ color: 'var(--muted-foreground)' }}>
                    → {ACTION_META[rule.action].label}
                  </span>
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
