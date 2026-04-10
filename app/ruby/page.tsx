'use client';

import { useSearchParams } from 'next/navigation';
import { LiveRuby } from '@/components/today/live-ruby';

export default function RubyPage() {
  const searchParams = useSearchParams();
  const prefill = searchParams?.get('q') ?? '';

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4" style={{ color: 'var(--foreground)' }}>Ruby</h1>
      <p className="text-sm mb-6" style={{ color: 'var(--muted-foreground)' }}>
        Ruby handles your comms &amp; writing — drafts, follow-ups, and anything you need put into words.
      </p>
      <LiveRuby prefill={prefill} />
    </div>
  );
}
