'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import useSWR from 'swr';
import type { V2FinanceOverviewFeed } from '@/lib/v2/types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type AlertId = string;

function getDismissKey(id: AlertId): string {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return `finance_alert_dismissed:${id}:${today}`;
}

function isDismissed(id: AlertId): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(getDismissKey(id)) === '1';
}

function dismiss(id: AlertId) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(getDismissKey(id), '1');
}

type AlertConfig = {
  id: AlertId;
  level: 'critical' | 'warning' | 'info';
  message: string;
};

function buildAlerts(feed: V2FinanceOverviewFeed): AlertConfig[] {
  const alerts: AlertConfig[] = [];

  // Overdue payables
  const overduePayables = feed.payables.filter((p) => p.status === 'overdue');
  if (overduePayables.length > 0) {
    alerts.push({
      id: 'overdue-payables',
      level: 'critical',
      message: `${overduePayables.length} payable${overduePayables.length !== 1 ? 's' : ''} overdue — review in Finance`,
    });
  }

  // Low cash: total liquid balances < $5,000
  const liquidTypes = new Set(['checking', 'savings', 'cash']);
  const liquidAccounts = feed.accounts.filter((a) => liquidTypes.has(a.type.toLowerCase()));
  const totalLiquid = liquidAccounts.reduce((sum, a) => sum + a.balance, 0);
  if (liquidAccounts.length > 0 && totalLiquid < 5000) {
    const formatted = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(totalLiquid);
    alerts.push({
      id: 'low-cash',
      level: 'warning',
      message: `Cash balance is low — ${formatted} across accounts`,
    });
  }

  // High subscription spend > $500/mo
  const totalSubMonthly = feed.subscriptions.reduce((sum, s) => sum + s.monthlyEquivalent, 0);
  if (totalSubMonthly > 500) {
    const formatted = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(totalSubMonthly);
    alerts.push({
      id: 'high-subscriptions',
      level: 'info',
      message: `Active subscriptions total ${formatted}/mo`,
    });
  }

  return alerts;
}

const LEVEL_STYLES: Record<AlertConfig['level'], { bg: string; border: string; iconColor: string; textColor: string }> = {
  critical: {
    bg: 'rgba(239,68,68,0.08)',
    border: 'rgba(239,68,68,0.35)',
    iconColor: '#ef4444',
    textColor: '#fca5a5',
  },
  warning: {
    bg: 'rgba(245,158,11,0.08)',
    border: 'rgba(245,158,11,0.35)',
    iconColor: '#f59e0b',
    textColor: '#fcd34d',
  },
  info: {
    bg: 'rgba(59,130,246,0.08)',
    border: 'rgba(59,130,246,0.35)',
    iconColor: '#3b82f6',
    textColor: '#93c5fd',
  },
};

const LEVEL_ICONS: Record<AlertConfig['level'], typeof AlertCircle> = {
  critical: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

function AlertBanner({ alert }: { alert: AlertConfig }) {
  const [visible, setVisible] = useState(true);
  const styles = LEVEL_STYLES[alert.level];
  const Icon = LEVEL_ICONS[alert.level];

  useEffect(() => {
    if (isDismissed(alert.id)) setVisible(false);
  }, [alert.id]);

  if (!visible) return null;

  const handleDismiss = () => {
    dismiss(alert.id);
    setVisible(false);
  };

  return (
    <div
      className="flex items-center gap-3 rounded-xl px-4 py-2.5"
      style={{
        background: alert.level === 'critical' ? 'rgba(253,240,208,0.9)' : alert.level === 'warning' ? '#fdf0d0' : styles.bg,
        border: alert.level === 'critical' ? '1px solid var(--ice-gold)' : alert.level === 'warning' ? '1px solid var(--ice-gold)' : `1px solid ${styles.border}`,
        borderLeft: `3px solid ${alert.level !== 'info' ? 'var(--ice-gold)' : styles.border}`,
      }}
    >
      <Icon className="w-4 h-4 flex-shrink-0" style={{ color: styles.iconColor }} />
      <span className="flex-1 text-sm" style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: alert.level !== 'info' ? 'var(--ice-brown)' : 'var(--ice-text)' }}>
        {alert.message}
      </span>
      <Link
        href="/finance"
        className="text-xs font-medium hover:opacity-80 transition-opacity flex-shrink-0"
        style={{ color: styles.textColor }}
      >
        Finance →
      </Link>
      <button
        onClick={handleDismiss}
        className="flex-shrink-0 hover:opacity-70 transition-opacity"
        aria-label="Dismiss"
        style={{ color: 'var(--muted-foreground)' }}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export function FinanceAlerts() {
  const { data, error } = useSWR<V2FinanceOverviewFeed>('/api/v2/finance/overview', fetcher, {
    refreshInterval: 120000,
    onErrorRetry: (err, _key, _config, revalidate, { retryCount }) => {
      // Give up after 2 retries — fail silently
      if (retryCount >= 2) return;
      setTimeout(() => revalidate({ retryCount }), 10000);
    },
  });

  // Fail silently on error or no data
  if (error || !data) return null;

  // Guard: check if it looks like an error response
  if ('error' in data) return null;

  const alerts = buildAlerts(data);
  if (alerts.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {alerts.map((alert) => (
        <AlertBanner key={alert.id} alert={alert} />
      ))}
    </div>
  );
}
