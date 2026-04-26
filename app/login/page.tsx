'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock, Eye, EyeOff, ExternalLink } from 'lucide-react';
import { MothershipLogo } from '@/components/ui/mothership-logo';

function LoginForm() {
  const [passphrase, setPassphrase] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const params = useSearchParams();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/v2/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passphrase }),
      });

      if (res.ok) {
        const from = params?.get('from') ?? '/today';
        router.push(from as Parameters<typeof router.push>[0]);
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? 'Incorrect passphrase');
      }
    } catch {
      setError('Could not reach server — try again');
    }

    setLoading(false);
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4"
      style={{ background: 'var(--background)' }}
    >
      <div
        className="w-full max-w-sm rounded-3xl p-8 flex flex-col gap-6"
        style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
      >
        {/* Logo / title */}
        <div className="flex flex-col items-center gap-4">
          <MothershipLogo size={52} />
          <div className="text-center">
            <h1 className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--foreground)' }}>
              Mothership
            </h1>
            <p className="text-sm mt-1" style={{ color: 'var(--muted-foreground)' }}>
              Passphrase bypassed during migration — click Unlock to continue
            </p>
          </div>
        </div>

        {/* Lock icon row */}
        <div className="flex justify-center">
          <div
            className="w-10 h-10 rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(0,217,255,0.08)', border: '1px solid rgba(0,217,255,0.18)' }}
          >
            <Lock className="w-5 h-5" style={{ color: 'var(--color-cyan)' }} />
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="relative">
            <input
              type={show ? 'text' : 'password'}
              placeholder="Passphrase"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              autoFocus
              className="w-full rounded-2xl px-4 py-3 pr-12 text-sm outline-none"
              style={{
                background: 'var(--muted)',
                border: error ? '1px solid #ef4444' : '1px solid var(--border)',
                color: 'var(--foreground)',
              }}
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 opacity-50 hover:opacity-100 transition-opacity"
              aria-label={show ? 'Hide passphrase' : 'Show passphrase'}
            >
              {show
                ? <EyeOff className="w-4 h-4" style={{ color: 'var(--foreground)' }} />
                : <Eye className="w-4 h-4" style={{ color: 'var(--foreground)' }} />
              }
            </button>
          </div>

          {error && (
            <p className="text-xs text-center" style={{ color: '#ef4444' }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="rounded-2xl py-3 text-sm font-semibold transition-opacity hover:opacity-80 disabled:opacity-40"
            style={{ background: 'var(--color-cyan)', color: '#0A0E1A' }}
          >
            {loading ? 'Verifying…' : 'Unlock'}
          </button>
        </form>

        {/* Demo link */}
        <div className="flex flex-col items-center gap-2 pt-1" style={{ borderTop: '1px solid var(--border)' }}>
          <p className="text-xs pt-3" style={{ color: 'var(--muted-foreground)' }}>
            Not the operator?
          </p>
          <a
            href="/demo.html"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs font-medium transition-opacity hover:opacity-70"
            style={{ color: 'var(--color-cyan)' }}
          >
            <ExternalLink className="w-3.5 h-3.5" />
            View platform demo
          </a>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
