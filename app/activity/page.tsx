'use client';

import useSWR from 'swr';
import { Card, CardTitle } from '@/components/ui/card';
import type { V2ActivityFeed } from '@/lib/v2/types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function ActivityPage() {
  const { data } = useSWR<V2ActivityFeed>('/api/v2/activity/log?page=1&pageSize=50', fetcher, { refreshInterval: 30000 });

  return (
    <div className="space-y-4">
      <Card>
        <CardTitle>Activity (High-Signal Timeline)</CardTitle>
        <div className="mt-3 space-y-3">
          {(data?.events ?? []).map((evt) => (
            <div key={evt.id} className="rounded-lg border border-border p-3">
              <p className="text-sm text-slate-900">{evt.description}</p>
              <p className="text-xs text-slate-500">
                {new Date(evt.timestamp).toLocaleString()} • {evt.eventType} • {evt.actor} • {evt.sourceIntegration}
              </p>
            </div>
          ))}
          {(data?.events ?? []).length === 0 && <p className="text-sm text-slate-500">No events match filters.</p>}
        </div>
      </Card>
    </div>
  );
}

