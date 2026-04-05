'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { Card, CardSubtitle, CardTitle } from '@/components/ui/card';
import type { V2EmailDraft, V2EmailDraftFeed, V2EmailFeed } from '@/lib/v2/types';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function EmailPage() {
  const { data } = useSWR<V2EmailFeed>('/api/v2/email', fetcher, { refreshInterval: 30000 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [liveDraft, setLiveDraft] = useState<V2EmailDraft | null>(null);

  const selected = useMemo(
    () => (data?.inbox ?? [])[0] && !selectedId ? (data?.inbox ?? [])[0] : (data?.inbox ?? []).find((item) => item.id === selectedId),
    [data, selectedId]
  );

  useEffect(() => {
    if (!selected && data?.inbox?.length) {
      setSelectedId(data.inbox[0].id);
    }
  }, [data, selected]);

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
      } catch (_error) {
        // ignore malformed stream payload
      }
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

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Email</h1>
        <p className="text-sm text-slate-500">Split-pane inbox with hybrid AI drafting from Ruby.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
        <Card>
          <CardTitle>Inbox</CardTitle>
          <CardSubtitle>Connected sources</CardSubtitle>
          <div className="mt-3 space-y-2">
            {(data?.inbox ?? []).map((email) => (
              <button
                key={email.id}
                type="button"
                onClick={() => setSelectedId(email.id)}
                className={`w-full rounded-lg border p-3 text-left ${selected?.id === email.id ? 'border-cyan-400 bg-cyan-50' : 'border-border bg-[var(--input-background)]'}`}
              >
                <p className="truncate text-sm font-semibold text-slate-900">{email.subject}</p>
                <p className="truncate text-xs text-slate-500">{email.sender}</p>
                <p className="mt-1 text-[11px] text-slate-500">{new Date(email.timestamp).toLocaleString()} • {email.sourceIntegration}</p>
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <CardTitle>{selected?.subject ?? 'Select an email'}</CardTitle>
          <CardSubtitle>{selected?.sender ?? 'No sender selected'}</CardSubtitle>
          <div className="mt-3 rounded-lg border border-border bg-[var(--input-background)] p-3 text-sm text-slate-700">
            {selected?.preview ?? 'Choose an email to load context.'}
          </div>

          <div className="mt-4 space-y-2">
            <p className="text-sm font-semibold text-slate-800">Ruby Draft Options</p>
            {drafts.map((draft) => (
              <div key={draft.id} className="rounded-lg border border-border bg-[var(--input-background)] p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-cyan-700">{draft.tone}</p>
                  <span className="text-[11px] text-slate-500">{draft.source === 'template' ? 'Template' : 'Live Ruby'}</span>
                </div>
                <p className="mt-1 text-sm text-slate-700">{draft.body}</p>
                <button
                  type="button"
                  className="mt-2 rounded-full bg-cyan-500 px-3 py-1 text-xs font-semibold text-white hover:bg-cyan-600"
                  onClick={async () => {
                    await fetch(draft.approveWebhook, { method: 'POST' });
                  }}
                >
                  Approve & Send
                </button>
              </div>
            ))}
            {drafts.length === 0 && <p className="text-sm text-slate-500">Loading draft options...</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}
