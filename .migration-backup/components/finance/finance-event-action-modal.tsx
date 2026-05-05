'use client';

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ElementType } from 'react';
import {
  X, CheckCircle2, Calendar, Eye, Tag, BarChart2,
  MessageSquare, Sparkles, RefreshCw, TrendingDown,
  ArrowUpRight, Bot, XCircle, ThumbsUp, PieChart, FileText,
} from 'lucide-react';
import type { V2FinanceEvent } from '@/lib/v2/types';
import { BOT_TELEGRAM_KEY } from '@/lib/constants/today';

// ─── Types ────────────────────────────────────────────────────────────────────

type FinanceModalAction = {
  key: string;
  icon: ElementType<{ className?: string; style?: CSSProperties }>;
  label: string;
  desc: string;
  color: string;
  textColor: string;
  fn: () => void | Promise<void>;
};

type FinanceModalSection = {
  title: string;
  sectionColor: string;
  actions: FinanceModalAction[];
};

export interface FinanceEventActionModalProps {
  event: V2FinanceEvent;
  onClose: () => void;
  onResolve: (id: string) => Promise<void>;
  onHighlightCluster?: (cluster: string | null) => void;
}

// ─── Color palette (finance dark theme) ──────────────────────────────────────

const C = {
  green:   { color: 'rgba(74,222,128,0.15)',  textColor: '#4ADE80'               },
  amber:   { color: 'rgba(251,146,60,0.15)',   textColor: '#FB923C'               },
  indigo:  { color: 'rgba(99,102,241,0.15)',   textColor: '#818CF8'               },
  red:     { color: 'rgba(248,113,113,0.15)',  textColor: '#F87171'               },
  muted:   { color: 'rgba(255,255,255,0.07)',  textColor: 'rgba(232,237,245,0.45)'},
  emerald: { color: 'rgba(52,211,153,0.15)',   textColor: '#34D399'               },
  peach:   { color: 'rgba(251,191,36,0.15)',   textColor: '#FBB724'               },
  pink:    { color: 'rgba(236,72,153,0.15)',   textColor: '#EC4899'               },
  sky:     { color: 'rgba(56,189,248,0.15)',   textColor: '#38BDF8'               },
} as const;

// ─── Event type labels (duplicated here to keep modal self-contained) ─────────

const EVENT_LABELS: Record<string, string> = {
  BILL_DUE:                   'Bill Due',
  TRANSACTION_DETECTED:       'Transaction',
  SUBSCRIPTION_DETECTED:      'Subscription',
  PAYMENT_MADE:               'Payment Made',
  PLAN_MILESTONE:             'Milestone',
  FINANCIAL_EMAIL:            'Financial Email',
  PLAN_PROGRESS:              'Plan Progress',
  BUDGET_THRESHOLD:           'Budget Alert',
  UNUSUAL_CHARGE:             'Unusual Charge',
  SUBSCRIPTION_PRICE_CHANGE:  'Price Increase',
  CATEGORY_SPIKE:             'Spending Spike',
  LOW_CASH_FORECAST:          'Cash Flow Alert',
  INCOME_SCHEDULE_DETECTED:   'Income Schedule',
  SUBSCRIPTION_OVERLAP:       'Subscription Overlap',
  ALERT:                      'Alert',
};

// ─── Section builder ─────────────────────────────────────────────────────────

function getSections(
  event: V2FinanceEvent,
  resolve: () => Promise<void>,
  onClose: () => void,
  onHighlightCluster?: (cluster: string | null) => void,
): FinanceModalSection[] {
  const p = event.payload as Record<string, unknown>;

  const scrollTo = (id: string, cluster?: string | null) => {
    if (cluster !== undefined) onHighlightCluster?.(cluster);
    setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
    onClose();
  };

  const telegram = async (botKey: string, text: string) => {
    const res = await fetch('/api/telegram/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, botKey }),
    });
    if (!res.ok) throw new Error(`Telegram send failed (${res.status})`);
    await resolve();
  };

  const botContext = `${EVENT_LABELS[event.type] ?? event.type}: ${
    String(p.vendor ?? p.merchant ?? p.categoryName ?? p.employer ?? p.description ?? '')
  } (Event ID: ${event.id})`;

  // ── Primary: Take Action ────────────────────────────────────────────────────

  let primaryActions: FinanceModalAction[];

  switch (event.type) {
    case 'BILL_DUE':
      primaryActions = [
        { key: 'mark-paid',  icon: CheckCircle2, label: 'Mark Paid',            desc: 'Record as paid and remove from the feed',              ...C.green,  fn: resolve },
        { key: 'schedule',   icon: Calendar,     label: 'Schedule Payment',      desc: 'Acknowledge — queue for later processing',             ...C.indigo, fn: resolve },
        { key: 'payable',    icon: FileText,     label: 'Open Payable Details',  desc: 'Jump to this item in the obligations section',         ...C.muted,  fn: () => scrollTo('payables-card') },
      ];
      break;

    case 'LOW_CASH_FORECAST':
      primaryActions = [
        { key: 'on-it',      icon: ThumbsUp,     label: 'On It',                desc: "I'm aware and managing the cash shortfall",            ...C.amber,  fn: resolve },
        { key: 'forecast',   icon: TrendingDown, label: 'View Forecast',         desc: 'Jump to the 30-day cash flow projection',              ...C.sky,    fn: () => scrollTo('cashflow-card') },
        { key: 'budget',     icon: PieChart,     label: 'Adjust Budget',         desc: 'Review and reduce spending in over-budget categories', ...C.amber,  fn: resolve },
      ];
      break;

    case 'SUBSCRIPTION_DETECTED':
      primaryActions = [
        { key: 'confirm', icon: CheckCircle2, label: 'Confirm Subscription',  desc: `Track ${String(p.merchant ?? 'this')} as a known recurring charge`, ...C.green, fn: async () => {
            await fetch('/api/v2/finance/merchants', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ merchantName: String(p.merchant ?? ''), action: 'confirm-subscription', eventId: event.id }),
            });
            await resolve();
          },
        },
        { key: 'view-subs', icon: Eye,        label: 'View Merchant',         desc: 'Browse the subscriptions section for context',         ...C.indigo, fn: () => scrollTo('subscriptions-card') },
        { key: 'ignore',    icon: XCircle,    label: 'Ignore',                desc: 'Dismiss — not a subscription or already tracked',      ...C.muted,  fn: async () => {
            await fetch('/api/v2/finance/merchants', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ merchantName: String(p.merchant ?? ''), action: 'ignore-subscription', eventId: event.id }),
            });
            await resolve();
          },
        },
      ];
      break;

    case 'SUBSCRIPTION_OVERLAP':
      primaryActions = [
        { key: 'review',    icon: Eye,        label: 'Review Subscriptions',  desc: 'Jump to subscriptions to compare and cancel services',  ...C.amber,  fn: () => scrollTo('subscriptions-card', (p.clusterName as string | undefined) ?? null) },
        { key: 'cancel',    icon: XCircle,    label: 'Cancel a Service',      desc: 'Acknowledge overlap — plan to cancel one service',      ...C.red,    fn: resolve },
        { key: 'dismiss',   icon: ThumbsUp,   label: 'Dismiss',               desc: "Aware of the overlap — no action needed right now",    ...C.muted,  fn: resolve },
      ];
      break;

    case 'INCOME_SCHEDULE_DETECTED':
      primaryActions = [
        { key: 'confirm',   icon: CheckCircle2, label: 'Confirm Income Source', desc: `Track ${String(p.employer ?? 'this')} as recurring income`, ...C.green,  fn: resolve },
        { key: 'adjust',    icon: RefreshCw,    label: 'Adjust Interval',       desc: 'Correct the detected pay schedule frequency',          ...C.indigo, fn: resolve },
        { key: 'not-mine',  icon: XCircle,      label: 'Not Mine',              desc: 'Mark as not a recognized income source',               ...C.muted,  fn: resolve },
      ];
      break;

    case 'UNUSUAL_CHARGE':
    case 'SUBSCRIPTION_PRICE_CHANGE':
    case 'CATEGORY_SPIKE':
      primaryActions = [
        { key: 'expected',   icon: ThumbsUp,  label: 'Mark Normal',            desc: "I recognize this — it's expected behavior",            ...C.amber,  fn: resolve },
        { key: 'categorize', icon: Tag,       label: 'Categorize',             desc: 'Correct the category for this transaction',            ...C.indigo, fn: resolve },
        { key: 'view-tx',    icon: Eye,       label: 'View Transaction',       desc: 'Jump to this transaction in the ledger',               ...C.muted,  fn: () => scrollTo('transactions-card') },
      ];
      break;

    case 'BUDGET_THRESHOLD':
      primaryActions = [
        { key: 'ack',        icon: ThumbsUp,  label: 'Acknowledged',           desc: "I've seen this — tracking the overage",                ...C.amber,  fn: resolve },
        { key: 'view-spend', icon: BarChart2, label: 'View Category Spend',    desc: 'Jump to transactions for this budget category',        ...C.sky,    fn: () => scrollTo('transactions-card') },
        { key: 'budget',     icon: PieChart,  label: 'Adjust Budget',          desc: 'Increase or recalibrate the monthly budget limit',     ...C.amber,  fn: resolve },
      ];
      break;

    case 'TRANSACTION_DETECTED':
      primaryActions = [
        { key: 'looks-right', icon: CheckCircle2, label: 'Looks Right',        desc: 'I recognize this transaction — all good',              ...C.green,  fn: resolve },
        { key: 'categorize',  icon: Tag,           label: 'Categorize',         desc: 'Set or correct the category for this transaction',     ...C.indigo, fn: resolve },
      ];
      break;

    case 'FINANCIAL_EMAIL':
      primaryActions = [
        { key: 'handled',    icon: CheckCircle2, label: 'Handled',             desc: "I've addressed this financial email",                  ...C.green,  fn: resolve },
        { key: 'irrelevant', icon: XCircle,      label: 'Not Relevant',        desc: 'This email does not require any action',               ...C.muted,  fn: resolve },
      ];
      break;

    case 'PAYMENT_MADE':
      primaryActions = [
        { key: 'got-it',     icon: CheckCircle2, label: 'Got It',              desc: 'Acknowledge this payment and clear from feed',         ...C.indigo, fn: resolve },
      ];
      break;

    case 'PLAN_MILESTONE':
    case 'PLAN_PROGRESS':
      primaryActions = [
        { key: 'noted',      icon: CheckCircle2, label: 'Noted',               desc: 'Acknowledge this plan update and clear from feed',     ...C.indigo, fn: resolve },
      ];
      break;

    default:
      primaryActions = [
        { key: 'dismiss',    icon: CheckCircle2, label: 'Dismiss',             desc: 'Mark as handled and remove from the feed',             ...C.muted,  fn: resolve },
      ];
  }

  // ── Get More Info ───────────────────────────────────────────────────────────

  const moreInfo: FinanceModalAction[] = [];

  if (event.type === 'LOW_CASH_FORECAST') {
    moreInfo.push({ key: 'info-forecast', icon: TrendingDown, label: 'View Forecast Context',    desc: 'See the full 30-day projected cash position',          ...C.sky,    fn: () => scrollTo('cashflow-card') });
  }
  if (event.type === 'BUDGET_THRESHOLD' || event.type === 'CATEGORY_SPIKE') {
    moreInfo.push({ key: 'info-spend',    icon: BarChart2,    label: 'View Category Spend',       desc: 'See all transactions in this budget category',         ...C.sky,    fn: () => scrollTo('transactions-card') });
  }
  if (event.type === 'SUBSCRIPTION_OVERLAP' || event.type === 'SUBSCRIPTION_DETECTED') {
    moreInfo.push({ key: 'info-subs',     icon: RefreshCw,    label: 'View All Subscriptions',    desc: 'Browse the full subscriptions list and compare',       ...C.sky,    fn: () => scrollTo('subscriptions-card') });
  }
  if (event.type === 'BILL_DUE') {
    moreInfo.push({ key: 'info-payable',  icon: FileText,     label: 'View Payable Details',      desc: 'Open the full payable record in obligations',          ...C.sky,    fn: () => scrollTo('payables-card') });
  }
  if (moreInfo.length === 0) {
    moreInfo.push({ key: 'info-tx',       icon: Eye,          label: 'View Related Transactions', desc: 'Jump to the transaction ledger for more context',      ...C.sky,    fn: () => scrollTo('transactions-card') });
  }

  // ── Fix Data / Re-Categorize ────────────────────────────────────────────────

  const fixData: FinanceModalAction[] = [
    { key: 'fix-category', icon: Tag,          label: 'Change Category',        desc: 'Correct the category assignment for this event',        ...C.indigo, fn: resolve },
  ];
  if (['SUBSCRIPTION_DETECTED', 'TRANSACTION_DETECTED', 'UNUSUAL_CHARGE'].includes(event.type)) {
    fixData.push({ key: 'fix-not-sub',   icon: XCircle,      label: 'Mark Not a Subscription',  desc: "Not a recurring charge — remove from subscription tracking", ...C.muted, fn: resolve });
  }
  if (['INCOME_SCHEDULE_DETECTED', 'TRANSACTION_DETECTED'].includes(event.type)) {
    fixData.push({ key: 'fix-income',    icon: ArrowUpRight, label: 'Mark as Income',            desc: 'Tag this transaction as a recognized income event',     ...C.green,  fn: resolve });
  }
  if (event.type === 'SUBSCRIPTION_PRICE_CHANGE') {
    fixData.push({ key: 'fix-price',     icon: RefreshCw,    label: 'Update Expected Price',     desc: 'Set the new expected price for this subscription',      ...C.indigo, fn: resolve });
  }

  // ── Assign to Bot ───────────────────────────────────────────────────────────

  const assignBot: FinanceModalAction[] = [
    {
      key: 'bot-emerald', icon: Bot,           label: 'Have Emerald Analyze',
      desc: 'Ask Emerald to investigate and report back',
      ...C.emerald,
      fn: () => telegram(BOT_TELEGRAM_KEY.Emerald ?? 'bot3', `Emerald, please investigate this finance event — ${botContext}`),
    },
    {
      key: 'bot-adrian',  icon: MessageSquare, label: 'Have Adrian Handle',
      desc: 'Delegate this to Adrian for operational follow-up',
      ...C.peach,
      fn: () => telegram(BOT_TELEGRAM_KEY.Adrian ?? 'bot1', `Adrian, please handle this finance event — ${botContext}`),
    },
    {
      key: 'bot-ruby',    icon: Sparkles,      label: 'Ask Ruby to Research',
      desc: 'Have Ruby find context, savings, or next steps',
      ...C.pink,
      fn: () => telegram(BOT_TELEGRAM_KEY.Ruby ?? 'bot2', `Ruby, please research this finance event — ${botContext}`),
    },
  ];

  return [
    { title: 'Take Action',   sectionColor: '#818CF8', actions: primaryActions },
    { title: 'Get More Info', sectionColor: '#38BDF8', actions: moreInfo },
    { title: 'Fix Data',      sectionColor: '#818CF8', actions: fixData },
    { title: 'Assign to Bot', sectionColor: '#34D399', actions: assignBot },
  ];
}

// ─── Modal component ──────────────────────────────────────────────────────────

export function FinanceEventActionModal({
  event,
  onClose,
  onResolve,
  onHighlightCluster,
}: FinanceEventActionModalProps) {
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    closeBtnRef.current?.focus();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [busy, onClose]);

  async function run(key: string, fn: () => void | Promise<void>) {
    setBusy(key);
    setErr(null);
    try {
      await fn();
      setDone(key);
      setTimeout(onClose, 700);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Action failed');
      setBusy(null);
    }
  }

  const sections = getSections(
    event,
    () => onResolve(event.id),
    onClose,
    onHighlightCluster,
  );

  const p = event.payload as Record<string, unknown>;
  const eventLabel = EVENT_LABELS[event.type] ?? event.type;
  const summaryLine = String(p.vendor ?? p.merchant ?? p.categoryName ?? p.employer ?? p.description ?? '');

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="finance-action-modal-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
    >
      <div
        className="w-full max-w-lg rounded-3xl flex flex-col"
        style={{
          background: 'rgba(10,14,30,0.98)',
          border: '1px solid rgba(99,102,241,0.25)',
          maxHeight: '82vh',
          boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-start gap-3 px-5 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2
                id="finance-action-modal-title"
                className="text-sm font-semibold"
                style={{ color: '#E8EDF5' }}
              >
                {eventLabel}
              </h2>
              <span
                className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
                style={{ background: 'rgba(99,102,241,0.18)', color: '#818CF8' }}
              >
                {event.source}
              </span>
            </div>
            {summaryLine && (
              <p className="text-xs mt-0.5 truncate" style={{ color: 'rgba(232,237,245,0.55)' }}>
                {summaryLine}
              </p>
            )}
          </div>
          <button
            ref={closeBtnRef}
            onClick={onClose}
            disabled={!!busy}
            aria-label="Close"
            className="w-7 h-7 rounded-xl flex items-center justify-center transition-opacity hover:opacity-70 disabled:opacity-30 flex-shrink-0"
            style={{ background: 'rgba(255,255,255,0.07)' }}
          >
            <X className="w-3.5 h-3.5" style={{ color: '#E8EDF5' }} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 scrollbar-hide">
          {sections.map((section, si) => (
            <div key={section.title}>
              <p
                className="text-[9px] font-bold uppercase tracking-widest mb-2 px-1"
                style={{ color: section.sectionColor, opacity: 0.65 }}
              >
                {section.title}
              </p>
              <div className="space-y-1.5">
                {section.actions.map((action) => (
                  <button
                    key={action.key}
                    disabled={busy !== null}
                    onClick={() => void run(action.key, action.fn)}
                    className="w-full flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition-opacity hover:opacity-85 disabled:cursor-not-allowed"
                    style={{
                      background: done === action.key ? action.color : 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      opacity: busy && busy !== action.key ? 0.35 : 1,
                    }}
                  >
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: action.color }}
                    >
                      {busy === action.key ? (
                        <div
                          className="w-4 h-4 rounded-full border-2 animate-spin"
                          style={{ borderColor: action.textColor, borderTopColor: 'transparent' }}
                        />
                      ) : done === action.key ? (
                        <CheckCircle2 className="w-4 h-4" style={{ color: action.textColor }} />
                      ) : (
                        <action.icon className="w-4 h-4" style={{ color: action.textColor }} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold" style={{ color: '#E8EDF5' }}>
                        {action.label}
                      </p>
                      <p className="text-xs truncate" style={{ color: 'rgba(232,237,245,0.50)' }}>
                        {action.desc}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
              {si < sections.length - 1 && (
                <div className="mt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }} />
              )}
            </div>
          ))}
          {err && (
            <p className="text-xs px-1 pb-1" style={{ color: '#F87171' }}>{err}</p>
          )}
        </div>

        {/* Footer */}
        <div
          className="px-4 py-3 flex-shrink-0 flex justify-end"
          style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}
        >
          <button
            onClick={onClose}
            disabled={!!busy}
            className="rounded-xl px-4 py-2 text-xs font-semibold transition-opacity hover:opacity-80 disabled:opacity-40"
            style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(232,237,245,0.55)' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
