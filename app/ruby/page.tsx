'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { LiveRuby } from '@/components/today/live-ruby';

function RubyPageContent() {
  const searchParams = useSearchParams();
  const initialPrefill = searchParams?.get('q') ?? '';
  const [prefill, setPrefill] = useState(initialPrefill);

  return (
    <LiveRuby
      prefill={prefill}
      onPrefillConsumed={() => setPrefill('')}
    />
  );
}

export default function RubyPage() {
  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4" style={{ color: 'var(--foreground)' }}>Ruby</h1>
      <p className="text-sm mb-6" style={{ color: 'var(--muted-foreground)' }}>
        Ruby handles your comms &amp; writing — drafts, follow-ups, and anything you need put into words.
      </p>
      <Suspense fallback={<div className="h-64 rounded-3xl animate-pulse" style={{ background: 'var(--muted)' }} />}>
        <RubyPageContent />
      </Suspense>
    </div>
  );
}
