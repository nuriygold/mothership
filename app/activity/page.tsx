'use client';

import useSWR from 'swr';
import { Card, CardTitle } from '@/components/ui/card';
import { useActivityFilters } from '@/lib/state/filters';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function ActivityPage() {
  const { data } = useSWR('/api/activity', fetcher);
  const { entityType, status, setEntityType, setStatus } = useActivityFilters();

  const events = (data ?? []).filter((evt: any) => {
    if (entityType && evt.entityType !== entityType) return false;
    if (status && evt.eventType !== status) return false;
    return true;
  });

  const entityTypes = Array.from(new Set((data ?? []).map((evt: any) => evt.entityType)));

  return (
    <div className="space-y-4">
      <div className="flex gap-3 text-xs text-slate-300">
        <select
          className="rounded-md border border-border bg-surface px-2 py-1"
          value={entityType ?? ''}
          onChange={(e) => setEntityType(e.target.value || null)}
        >
          <option value="">All entities</option>
          {entityTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        <input
          className="rounded-md border border-border bg-surface px-2 py-1"
          placeholder="Filter event type"
          value={status ?? ''}
          onChange={(e) => setStatus(e.target.value || null)}
        />
      </div>

      <Card>
        <CardTitle>Activity</CardTitle>
        <div className="mt-3 space-y-3">
          {events.map((evt: any) => (
            <div key={evt.id} className="rounded-lg border border-border p-3">
              <p className="text-sm text-white">{evt.eventType}</p>
              <p className="text-xs text-slate-400">{evt.entityType} • {new Date(evt.createdAt).toLocaleString()}</p>
            </div>
          ))}
          {events.length === 0 && <p className="text-sm text-slate-500">No events match filters.</p>}
        </div>
      </Card>
    </div>
  );
}
