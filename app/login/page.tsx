'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const [passphrase, setPassphrase] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!passphrase.trim() || loading) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/v2/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passphrase }),
      });

      if (res.ok) {
        router.push('/today');
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
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'var(--background)' }}
    >
      <div
        className="w-full max-w-sm rounded-3xl p-8 flex flex-col gap-6"
        style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
      >
        {/* Logo / title */}
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(0,217,255,0.1)', border: '1px solid rgba(0,217,255,0.2)' }}
          >
            <Lock className="w-7 h-7" style={{ color: 'var(--color-cyan)' }} />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-semibold" style={{ color: 'var(--foreground)' }}>
              Mothership
            </h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
              Enter your passphrase to sync memory across devices
            </p>
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
                border: '1px solid var(--border)',
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
            disabled={!passphrase.trim() || loading}
            className="rounded-2xl py-3 text-sm font-semibold transition-opacity hover:opacity-80 disabled:opacity-40"
            style={{ background: 'var(--color-cyan)', color: '#0A0E1A' }}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="text-center text-xs" style={{ color: 'var(--muted-foreground)' }}>
          Sets a secure cookie — valid for 1 year per browser
        </p>
      </div>
    </div>
  );
}
