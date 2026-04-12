'use client';

import { useState, useEffect, useRef } from 'react';
import { X, ExternalLink, Unlink, Zap, ChevronRight, ImageIcon, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { V2VisionItem, V2VisionPillar, V2VisionEmeraldSuggestion, VisionItemStatus } from '@/lib/v2/types';
import { ProgressRing } from './progress-ring';
import { PILLAR_COLORS } from './pillar-colors';
import { EmeraldSuggestionRow, EmeraldThinking } from './emerald-suggestion-row';

const STATUS_OPTIONS: VisionItemStatus[] = ['DREAMING', 'ACTIVE', 'ACHIEVED', 'ON_HOLD'];
const STATUS_LABELS: Record<VisionItemStatus, string> = {
  DREAMING: 'Dreaming',
  ACTIVE: 'Active',
  ACHIEVED: 'Achieved',
  ON_HOLD: 'On Hold',
};

type SuggestionState = 'idle' | 'thinking' | 'done' | 'error';

interface ItemDetailDrawerProps {
  item: V2VisionItem;
  pillar: V2VisionPillar;
  onClose: () => void;
  onUpdated: () => void;
}

export function ItemDetailDrawer({ item, pillar, onClose, onUpdated }: ItemDetailDrawerProps) {
  const router = useRouter();
  const colors = PILLAR_COLORS[pillar.color];
  const [editingStatus, setEditingStatus] = useState(false);
  const [suggestions, setSuggestions] = useState<V2VisionEmeraldSuggestion[]>([]);
  const [suggestionState, setSuggestionState] = useState<SuggestionState>('idle');
  const [dispatching, setDispatching] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [liveImageUrl, setLiveImageUrl] = useState<string | null>(item.imageUrl ?? null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Clean up SSE on unmount
  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  async function handleStatusChange(newStatus: VisionItemStatus) {
    await fetch(`/api/v2/vision/items/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    setEditingStatus(false);
    onUpdated();
  }

  async function handleUnlinkCampaign(campaignId: string) {
    await fetch(`/api/v2/vision/items/${item.id}/link-campaign`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaignId }),
    });
    onUpdated();
  }

  async function handleUnlinkPlan(financePlanId: string) {
    await fetch(`/api/v2/vision/items/${item.id}/link-finance-plan`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ financePlanId }),
    });
    onUpdated();
  }

  async function handleGetSuggestions() {
    if (suggestionState === 'thinking') return;
    setSuggestionState('thinking');
    setSuggestions([]);

    try {
      const res = await fetch(`/api/v2/vision/items/${item.id}/suggestions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const { streamId } = await res.json();

      // Subscribe to the SSE stream
      const es = new EventSource(`/api/v2/stream?channel=${encodeURIComponent(streamId)}`);
      eventSourceRef.current = es;

      let settled = false;

      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === 'emerald.suggestions') {
            settled = true;
            setSuggestions(data.payload.suggestions ?? []);
            setSuggestionState('done');
            es.close();
          } else if (data.type === 'emerald.error') {
            settled = true;
            setSuggestionState('error');
            es.close();
          }
        } catch {
          // non-JSON keep-alive
        }
      };

      es.onerror = () => {
        settled = true;
        setSuggestionState('error');
        es.close();
      };

      // Timeout after 30s
      setTimeout(() => {
        if (!settled) {
          setSuggestionState('error');
          es.close();
        }
      }, 30000);
    } catch {
      setSuggestionState('error');
    }
  }

  async function handleGenerateImage() {
    if (generatingImage) return;
    setGeneratingImage(true);
    try {
      const res = await fetch(`/api/v2/vision/items/${item.id}/generate-image`, {
        method: 'POST',
      });
      const json = await res.json();
      if (res.ok && json.imageUrl) {
        setLiveImageUrl(json.imageUrl);
        onUpdated();
      }
    } finally {
      setGeneratingImage(false);
    }
  }

  async function handleDispatch() {
    setDispatching(true);
    try {
      const res = await fetch(`/api/v2/vision/items/${item.id}/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const { campaignId } = await res.json();
      onUpdated();
      router.push(`/dispatch?campaignId=${campaignId}`);
    } catch {
      setDispatching(false);
    }
  }

  function handleSuggestionAction(suggestion: V2VisionEmeraldSuggestion) {
    if (suggestion.actionType === 'campaign') {
      handleDispatch();
    } else if (suggestion.actionType === 'finance_plan') {
      router.push('/finance');
    }
    // task and note types are informational
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.35)' }}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className="fixed right-0 top-0 bottom-0 z-50 flex flex-col overflow-hidden"
        style={{
          width: 'min(420px, 100vw)',
          background: 'var(--card)',
          borderLeft: '1px solid var(--card-border)',
          boxShadow: '-8px 0 32px rgba(0,0,0,0.12)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--card-border)' }}
        >
          <div className="flex items-start gap-2 flex-1 min-w-0">
            {item.imageEmoji && (
              <span className="text-2xl leading-none flex-shrink-0 mt-0.5">{item.imageEmoji}</span>
            )}
            <div>
              <h2 className="font-semibold text-base leading-snug" style={{ color: 'var(--foreground)' }}>
                {item.title}
              </h2>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span
                  className="text-xs rounded-full px-2 py-0.5"
                  style={{ background: colors.bg, color: colors.text }}
                >
                  {pillar.emoji} {pillar.label}
                </span>
                {editingStatus ? (
                  <select
                    value={item.status}
                    onChange={(e) => handleStatusChange(e.target.value as VisionItemStatus)}
                    onBlur={() => setEditingStatus(false)}
                    autoFocus
                    className="text-xs rounded-full px-2 py-0.5 outline-none"
                    style={{ background: 'var(--muted)', color: 'var(--foreground)', border: '1px solid var(--card-border)' }}
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                ) : (
                  <button
                    onClick={() => setEditingStatus(true)}
                    className="text-xs rounded-full px-2 py-0.5 transition-opacity hover:opacity-80"
                    style={{ background: 'var(--muted)', color: 'var(--foreground)', opacity: 0.65 }}
                  >
                    {STATUS_LABELS[item.status]}
                  </button>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-opacity hover:opacity-70"
            style={{ background: 'var(--muted)' }}
          >
            <X className="w-4 h-4" style={{ color: 'var(--foreground)' }} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">
          {/* Progress */}
          <div className="flex items-center gap-4">
            <ProgressRing
              percent={item.overallProgressPercent}
              size={56}
              strokeWidth={5}
              color={colors.accent}
            />
            <div>
              <p className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>
                {item.overallProgressPercent}%
              </p>
              <p className="text-xs" style={{ color: 'var(--foreground)', opacity: 0.5 }}>
                overall progress
              </p>
            </div>
          </div>

          {/* Vision image */}
          <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--card-border)' }}>
            {liveImageUrl ? (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={liveImageUrl}
                  alt={item.title}
                  className="w-full object-cover"
                  style={{ height: '220px' }}
                />
                <button
                  onClick={handleGenerateImage}
                  disabled={generatingImage}
                  className="absolute bottom-2 right-2 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{ background: 'rgba(0,0,0,0.55)', color: '#fff', backdropFilter: 'blur(4px)' }}
                >
                  <RefreshCw className={`w-3 h-3 ${generatingImage ? 'animate-spin' : ''}`} />
                  {generatingImage ? 'Generating…' : 'Regenerate'}
                </button>
              </div>
            ) : (
              <button
                onClick={handleGenerateImage}
                disabled={generatingImage}
                className="w-full flex flex-col items-center justify-center gap-2 transition-opacity hover:opacity-80 disabled:opacity-50"
                style={{
                  height: '160px',
                  background: `${colors.bg}`,
                }}
              >
                {generatingImage ? (
                  <>
                    <div
                      className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
                      style={{ borderColor: `${colors.accent} transparent transparent transparent` }}
                    />
                    <span className="text-xs font-medium" style={{ color: colors.text }}>
                      Generating with Flux…
                    </span>
                  </>
                ) : (
                  <>
                    <ImageIcon className="w-6 h-6" style={{ color: colors.accent }} />
                    <span className="text-xs font-medium" style={{ color: colors.text }}>
                      Generate image with Flux
                    </span>
                  </>
                )}
              </button>
            )}
          </div>

          {/* Description */}
          {item.description && (
            <p className="text-sm leading-relaxed" style={{ color: 'var(--foreground)', opacity: 0.7 }}>
              {item.description}
            </p>
          )}

          {/* Target date */}
          {item.targetDate && (
            <p className="text-xs" style={{ color: 'var(--foreground)', opacity: 0.45 }}>
              Target: {new Date(item.targetDate).toLocaleDateString('en-US', { month: 'long', year: 'numeric', day: 'numeric' })}
            </p>
          )}

          {/* Linked campaigns */}
          {item.linkedCampaigns.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--foreground)', opacity: 0.45 }}>
                Linked Campaigns
              </h3>
              <div className="flex flex-col gap-2">
                {item.linkedCampaigns.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between gap-2 rounded-xl p-3"
                    style={{ background: 'var(--muted)', border: '1px solid var(--card-border)' }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--foreground)' }}>
                          {c.title}
                        </p>
                        <span
                          className="text-[10px] rounded-full px-1.5 py-0.5 flex-shrink-0"
                          style={{ background: 'rgba(0,217,255,0.1)', color: '#00D9FF' }}
                        >
                          {c.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1 h-1 rounded-full" style={{ background: 'var(--card-border)' }}>
                          <div
                            className="h-1 rounded-full transition-all"
                            style={{ width: `${c.progressPercent}%`, background: colors.accent }}
                          />
                        </div>
                        <span className="text-[11px] flex-shrink-0" style={{ color: 'var(--foreground)', opacity: 0.5 }}>
                          {c.progressPercent}%
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => router.push(`/dispatch`)}
                        className="w-7 h-7 rounded-full flex items-center justify-center transition-opacity hover:opacity-70"
                        style={{ background: 'var(--card)' }}
                        title="Open in Dispatch"
                      >
                        <ExternalLink className="w-3.5 h-3.5" style={{ color: 'var(--foreground)', opacity: 0.5 }} />
                      </button>
                      <button
                        onClick={() => handleUnlinkCampaign(c.id)}
                        className="w-7 h-7 rounded-full flex items-center justify-center transition-opacity hover:opacity-70"
                        style={{ background: 'var(--card)' }}
                        title="Unlink"
                      >
                        <Unlink className="w-3.5 h-3.5" style={{ color: 'var(--foreground)', opacity: 0.5 }} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Linked finance plans */}
          {item.linkedFinancePlans.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--foreground)', opacity: 0.45 }}>
                Linked Finance Plans
              </h3>
              <div className="flex flex-col gap-2">
                {item.linkedFinancePlans.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-2 rounded-xl p-3"
                    style={{ background: 'var(--muted)', border: '1px solid var(--card-border)' }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--foreground)' }}>
                          {p.title}
                        </p>
                        <span
                          className="text-[10px] rounded-full px-1.5 py-0.5 flex-shrink-0"
                          style={{ background: 'rgba(0,217,255,0.08)', color: 'var(--foreground)', opacity: 0.7 }}
                        >
                          {p.type}
                        </span>
                      </div>
                      {p.progressPercent !== null && (
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-1 h-1 rounded-full" style={{ background: 'var(--card-border)' }}>
                            <div
                              className="h-1 rounded-full"
                              style={{ width: `${p.progressPercent}%`, background: colors.accent }}
                            />
                          </div>
                          <span className="text-[11px] flex-shrink-0" style={{ color: 'var(--foreground)', opacity: 0.5 }}>
                            {p.progressPercent}%
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => router.push('/finance')}
                        className="w-7 h-7 rounded-full flex items-center justify-center transition-opacity hover:opacity-70"
                        style={{ background: 'var(--card)' }}
                        title="Open in Finance"
                      >
                        <ExternalLink className="w-3.5 h-3.5" style={{ color: 'var(--foreground)', opacity: 0.5 }} />
                      </button>
                      <button
                        onClick={() => handleUnlinkPlan(p.id)}
                        className="w-7 h-7 rounded-full flex items-center justify-center transition-opacity hover:opacity-70"
                        style={{ background: 'var(--card)' }}
                        title="Unlink"
                      >
                        <Unlink className="w-3.5 h-3.5" style={{ color: 'var(--foreground)', opacity: 0.5 }} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Emerald suggestions */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--foreground)', opacity: 0.45 }}>
                Emerald&apos;s Take
              </h3>
              {suggestionState !== 'thinking' && (
                <button
                  onClick={handleGetSuggestions}
                  className="text-[11px] flex items-center gap-1 rounded-full px-2.5 py-1 transition-opacity hover:opacity-80"
                  style={{ background: 'rgba(123,104,238,0.12)', color: '#7B68EE' }}
                >
                  <Zap className="w-3 h-3" />
                  {suggestionState === 'idle' ? 'Ask Emerald' : 'Refresh'}
                </button>
              )}
            </div>

            {suggestionState === 'idle' && (
              <p className="text-xs" style={{ color: 'var(--foreground)', opacity: 0.4 }}>
                Ask Emerald to analyze this goal and suggest concrete next actions.
              </p>
            )}
            {suggestionState === 'thinking' && <EmeraldThinking />}
            {suggestionState === 'error' && (
              <p className="text-xs" style={{ color: '#E53E3E' }}>
                Couldn&apos;t reach Emerald. Try again.
              </p>
            )}
            {suggestionState === 'done' && suggestions.length > 0 && (
              <div className="flex flex-col gap-2">
                {suggestions.map((s) => (
                  <EmeraldSuggestionRow key={s.id} suggestion={s} onAction={handleSuggestionAction} />
                ))}
              </div>
            )}
          </section>

          {/* Notes */}
          {item.notes && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'var(--foreground)', opacity: 0.45 }}>
                Notes
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--foreground)', opacity: 0.65 }}>
                {item.notes}
              </p>
            </section>
          )}
        </div>

        {/* Footer CTA */}
        <div
          className="px-5 py-4 flex-shrink-0"
          style={{ borderTop: '1px solid var(--card-border)' }}
        >
          <button
            onClick={handleDispatch}
            disabled={dispatching}
            className="w-full flex items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold transition-opacity hover:opacity-80 disabled:opacity-40"
            style={{ background: colors.accent, color: '#fff' }}
          >
            <Zap className="w-4 h-4" />
            {dispatching ? 'Creating campaign…' : 'Make progress on this →'}
            {!dispatching && <ChevronRight className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </>
  );
}
