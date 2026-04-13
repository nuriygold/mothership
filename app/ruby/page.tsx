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
    <div
      className="flex flex-col rounded-2xl overflow-hidden"
      style={{
        height: 'calc(100vh - 80px)',
        border: '1px solid var(--border)',
        background: 'var(--card)',
      }}
    >
      <Suspense
        fallback={
          <div className="flex-1 animate-pulse rounded-2xl" style={{ background: 'var(--muted)' }} />
        }
      >
        <RubyPageContent />
      </Suspense>
    </div>
  );
}
