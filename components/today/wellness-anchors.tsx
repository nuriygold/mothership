'use client';

import { useEffect, useRef, useState, type ElementType, type ReactNode } from 'react';
import { Droplets, Footprints, Dumbbell, Heart, BookOpen, Zap, Pill, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { OuraTodayData } from '@/lib/oura';

type AnchorDef = {
  key: string;
  label: string;
  icon: ElementType;
  bg: string;
  text: string;
  todayActive: boolean;
  ydayActive: boolean;
  todaySub: ReactNode;
  ydaySub: ReactNode;
  onTap: () => void;
};

interface WellnessState {
  water: number;    // 0–8 glasses
  steps: number;    // 0–10 (thousands of steps)
  workout: boolean;
  prayer: boolean;
  journal: boolean;
  vitamins: boolean;
}

const WELLNESS_DEFAULT: WellnessState = { water: 0, steps: 0, workout: false, prayer: false, journal: false, vitamins: false };

function easternDateString(offsetDays = 0): string {
  const d = new Date();
  if (offsetDays !== 0) {
    d.setDate(d.getDate() + offsetDays);
  }
  return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); // YYYY-MM-DD
}

function todayDate() {
  return easternDateString(0);
}

function yesterdayDate() {
  return easternDateString(-1);
}

function wellnessKey() {
  return `wellness-${easternDateString(0)}`;
}

function loadWellness(): WellnessState {
  if (typeof window === 'undefined') return WELLNESS_DEFAULT;
  try {
    const s = localStorage.getItem(wellnessKey());
    return s ? { ...WELLNESS_DEFAULT, ...JSON.parse(s) } : WELLNESS_DEFAULT;
  } catch { return WELLNESS_DEFAULT; }
}

function saveWellness(s: WellnessState) {
  try { localStorage.setItem(wellnessKey(), JSON.stringify(s)); } catch { /**/ }
}

// Tracks the last values Oura reported, so we can detect when Oura has new data.
// Oura only wins for a field when its value changes from what it last reported.
// User edits are preserved as long as Oura's value stays the same.
interface OuraCache { steps: number; workout: boolean; }
function ouraKey() { return `oura-cache-${easternDateString(0)}`; }
function loadOuraCache(): OuraCache | null {
  try { const s = localStorage.getItem(ouraKey()); return s ? JSON.parse(s) : null; } catch { return null; }
}
function saveOuraCache(c: OuraCache) {
  try { localStorage.setItem(ouraKey(), JSON.stringify(c)); } catch { /**/ }
}

async function fetchFromSupabase(date: string): Promise<WellnessState | null> {
  const { data, error } = await supabase
    .from('wellness_logs')
    .select('water, steps, workout, prayer, journal, vitamins')
    .eq('date', date)
    .maybeSingle();
  if (error || !data) return null;
  return {
    water: data.water,
    steps: data.steps,
    workout: data.workout,
    prayer: data.prayer,
    journal: data.journal,
    vitamins: data.vitamins ?? false,
  };
}

async function syncToSupabase(state: WellnessState) {
  await supabase.from('wellness_logs').upsert(
    { date: todayDate(), ...state, updated_at: new Date().toISOString() },
    { onConflict: 'date' }
  );
}

export function WellnessAnchors({ onAllComplete }: { onAllComplete?: () => void } = {}) {
  const [w, setW] = useState<WellnessState>(WELLNESS_DEFAULT);
  const [yw, setYw] = useState<WellnessState>(WELLNESS_DEFAULT);
  const [celebrate, setCelebrate] = useState(false);
  const [oura, setOura] = useState<OuraTodayData | null>(null);
  const [ouraYesterday, setOuraYesterday] = useState<OuraTodayData | null>(null);
  const [ouraRefreshing, setOuraRefreshing] = useState(false);
  const celebrateTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const local = loadWellness();
    setW(local);

    const ydate = yesterdayDate();
    const tdate = todayDate();

    Promise.all([
      fetchFromSupabase(tdate),
      fetchFromSupabase(ydate),
      // Yesterday Oura is read-only (no user edits possible) — safe to auto-fetch
      fetch(`/api/oura/today?date=${ydate}`).then((r) => r.json() as Promise<OuraTodayData>).catch(() => null),
    ]).then(([remote, remoteYesterday, ouraYday]) => {
      setOuraYesterday(ouraYday);

      // Today — use saved data only; Oura sync is manual via the refresh button
      const base = remote ?? local;
      setW(base);
      saveWellness(base);

      // Yesterday (read-only) — Oura always wins, no user edits possible
      const ylocal = (() => {
        try {
          const s = localStorage.getItem(`wellness-${ydate}`);
          return s ? { ...WELLNESS_DEFAULT, ...JSON.parse(s) } : null;
        } catch { return null; }
      })();
      const ybase = remoteYesterday ?? ylocal ?? WELLNESS_DEFAULT;
      const ymerged: WellnessState = {
        ...ybase,
        ...(ouraYday?.connected ? { steps: ouraYday.steps, workout: ouraYday.workout } : {}),
      };
      setYw(ymerged);
    });
  }, []);

  async function refreshFromOura() {
    setOuraRefreshing(true);
    try {
      const tdate = todayDate();
      const ouraData = await fetch(`/api/oura/today?date=${tdate}`)
        .then((r) => r.json() as Promise<OuraTodayData>)
        .catch(() => null);
      setOura(ouraData);
      if (ouraData?.connected) {
        setW((prev) => {
          const cache = loadOuraCache();
          const merged = { ...prev };
          if (ouraData.steps !== cache?.steps) merged.steps = ouraData.steps;
          if (ouraData.workout !== cache?.workout) merged.workout = ouraData.workout;
          saveOuraCache({ steps: ouraData.steps, workout: ouraData.workout });
          saveWellness(merged);
          void syncToSupabase(merged);
          return merged;
        });
      }
    } finally {
      setOuraRefreshing(false);
    }
  }

  useEffect(() => () => clearTimeout(celebrateTimer.current), []);

  function update(patch: Partial<WellnessState>) {
    setW((prev) => {
      const next = { ...prev, ...patch };
      saveWellness(next);
      void syncToSupabase(next);
      const wasAllDone = prev.water >= 8 && prev.steps >= 10 && prev.workout && prev.prayer && prev.journal && prev.vitamins;
      const allDone = next.water >= 8 && next.steps >= 10 && next.workout && next.prayer && next.journal && next.vitamins;
      if (allDone) {
        setCelebrate(true);
        clearTimeout(celebrateTimer.current);
        celebrateTimer.current = setTimeout(() => setCelebrate(false), 1800);
        if (!wasAllDone) {
          onAllComplete?.();
        }
      }
      return next;
    });
  }

  const done = [w.water >= 8, w.steps >= 10, w.workout, w.prayer, w.journal, w.vitamins].filter(Boolean).length;
  const pct = (done / 6) * 100;
  const r = 16; const circ = 2 * Math.PI * r;

  const anchors: AnchorDef[] = [
    {
      key: 'water', label: 'Water', icon: Droplets,
      bg: 'var(--color-sky)', text: 'var(--color-sky-text)',
      todayActive: w.water >= 8, ydayActive: yw.water >= 8,
      todaySub: (
        <span className="flex gap-0.5 flex-wrap justify-center mt-0.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <span key={i} className="w-1 h-1 rounded-full transition-all"
              style={{ background: i < w.water ? 'var(--color-sky-text)' : 'var(--border)' }} />
          ))}
        </span>
      ),
      ydaySub: (
        <span className="flex gap-0.5 flex-wrap justify-center mt-0.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <span key={i} className="w-1 h-1 rounded-full"
              style={{ background: i < yw.water ? 'var(--color-sky-text)' : 'var(--border)' }} />
          ))}
        </span>
      ),
      onTap: () => update({ water: w.water >= 8 ? 0 : w.water + 1 }),
    },
    {
      key: 'steps', label: 'Steps', icon: Footprints,
      bg: 'var(--color-mint)', text: 'var(--color-mint-text)',
      todayActive: w.steps >= 10, ydayActive: yw.steps >= 10,
      todaySub: (
        <span className="text-[8px] flex items-center gap-0.5">
          {oura?.connected && <Zap className="w-2 h-2 opacity-60" />}
          {w.steps}k
        </span>
      ),
      ydaySub: (
        <span className="text-[8px] flex items-center gap-0.5">
          {ouraYesterday?.connected && <Zap className="w-2 h-2 opacity-60" />}
          {yw.steps}k
        </span>
      ),
      onTap: () => update({ steps: w.steps >= 10 ? 0 : w.steps + 1 }),
    },
    {
      key: 'workout', label: 'Move', icon: Dumbbell,
      bg: 'var(--color-peach)', text: 'var(--color-peach-text)',
      todayActive: w.workout, ydayActive: yw.workout,
      todaySub: (
        <span className="text-[8px] flex items-center gap-0.5">
          {oura?.connected && <Zap className="w-2 h-2 opacity-60" />}
          {w.workout ? '✓' : '—'}
        </span>
      ),
      ydaySub: (
        <span className="text-[8px] flex items-center gap-0.5">
          {ouraYesterday?.connected && <Zap className="w-2 h-2 opacity-60" />}
          {yw.workout ? '✓' : '—'}
        </span>
      ),
      onTap: () => update({ workout: !w.workout }),
    },
    {
      key: 'prayer', label: 'Prayer', icon: Heart,
      bg: 'var(--color-lavender)', text: 'var(--color-lavender-text)',
      todayActive: w.prayer, ydayActive: yw.prayer,
      todaySub: <span className="text-[8px]">{w.prayer ? '✓' : '—'}</span>,
      ydaySub: <span className="text-[8px]">{yw.prayer ? '✓' : '—'}</span>,
      onTap: () => update({ prayer: !w.prayer }),
    },
    {
      key: 'journal', label: 'Journal', icon: BookOpen,
      bg: 'var(--color-lemon)', text: 'var(--color-lemon-text)',
      todayActive: w.journal, ydayActive: yw.journal,
      todaySub: <span className="text-[8px]">{w.journal ? '✓' : '—'}</span>,
      ydaySub: <span className="text-[8px]">{yw.journal ? '✓' : '—'}</span>,
      onTap: () => update({ journal: !w.journal }),
    },
    {
      key: 'vitamins', label: 'Vitamins', icon: Pill,
      bg: 'var(--color-pink)', text: 'var(--color-pink-text)',
      todayActive: w.vitamins, ydayActive: yw.vitamins,
      todaySub: <span className="text-[8px]">{w.vitamins ? '✓' : '—'}</span>,
      ydaySub: <span className="text-[8px]">{yw.vitamins ? '✓' : '—'}</span>,
      onTap: () => update({ vitamins: !w.vitamins }),
    },
  ];

  return (
    <div className="rounded-3xl border p-4 transition-all"
      style={{
        background: celebrate ? 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 50%, #fde68a 100%)' : '#EDE8DC',
        borderColor: celebrate ? '#F59E0B' : 'var(--border)',
      }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <svg width="40" height="40" viewBox="0 0 40 40" className="-rotate-90">
            <circle cx="20" cy="20" r={r} fill="none" stroke="var(--border)" strokeWidth="3" />
            <circle cx="20" cy="20" r={r} fill="none"
              stroke={done === 6 ? '#F59E0B' : 'var(--color-cyan)'}
              strokeWidth="3"
              strokeDasharray={circ}
              strokeDashoffset={circ - (circ * pct) / 100}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 0.4s ease' }}
            />
            <text x="20" y="20" textAnchor="middle" dominantBaseline="central"
              className="rotate-90" style={{ fontSize: 10, fontWeight: 700, fill: done === 6 ? '#B45309' : 'var(--foreground)', transform: 'rotate(90deg)', transformOrigin: '20px 20px' }}>
              {done}/6
            </text>
          </svg>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted-foreground)' }}>Daily Anchors</p>
            <p className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
              {done === 6 ? '🏆 All done — you\'re on fire!' : `${6 - done} left today`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void refreshFromOura()}
            disabled={ouraRefreshing}
            title="Sync Oura ring data"
            className="flex items-center gap-1 rounded-xl px-2 py-1 text-[10px] transition-opacity hover:opacity-80 active:scale-95"
            style={{ color: 'var(--muted-foreground)', background: 'rgba(0,0,0,0.05)', opacity: ouraRefreshing ? 0.5 : 1 }}
          >
            <Zap className="w-3 h-3" />
            <RefreshCw className={`w-3 h-3 ${ouraRefreshing ? 'animate-spin' : ''}`} />
          </button>
          {celebrate && <span className="text-lg animate-bounce">🎉</span>}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {anchors.map((a) => {
          const Icon = a.icon;
          return (
            <div key={a.key} className="rounded-2xl overflow-hidden flex flex-col sm:flex-row"
              style={{
                border: `1.5px solid ${a.todayActive ? a.text : 'transparent'}`,
                boxShadow: a.todayActive ? `0 2px 8px rgba(0,0,0,0.08)` : 'none',
              }}>
              {/* Yesterday — read-only */}
              <div className="flex flex-col items-center gap-0.5 py-2 px-1 flex-1 opacity-55"
                style={{ background: a.ydayActive ? a.bg : 'rgba(0,0,0,0.05)' }}>
                <span className="text-[7px] font-semibold uppercase tracking-wide"
                  style={{ color: a.ydayActive ? a.text : 'var(--muted-foreground)' }}>Yday</span>
                <Icon className="w-3.5 h-3.5" style={{ color: a.ydayActive ? a.text : 'var(--muted-foreground)' }} />
                <span className="text-[9px] font-semibold leading-tight"
                  style={{ color: a.ydayActive ? a.text : 'var(--muted-foreground)' }}>{a.label}</span>
                <div style={{ color: a.ydayActive ? a.text : 'var(--muted-foreground)' }}>{a.ydaySub}</div>
              </div>
              {/* Divider */}
              <div className="h-px w-full sm:h-auto sm:w-px"
                style={{ background: a.todayActive ? a.text : 'rgba(0,0,0,0.1)', opacity: 0.3 }} />
              {/* Today — interactive */}
              <button onClick={a.onTap}
                className="flex flex-col items-center gap-0.5 py-2 px-1 transition-all hover:brightness-95 active:scale-95 flex-1"
                style={{ background: a.todayActive ? a.bg : 'var(--muted)' }}>
                <span className="text-[7px] font-semibold uppercase tracking-wide"
                  style={{ color: a.todayActive ? a.text : 'var(--muted-foreground)' }}>Today</span>
                <Icon className="w-3.5 h-3.5" style={{ color: a.todayActive ? a.text : 'var(--muted-foreground)' }} />
                <span className="text-[9px] font-semibold leading-tight"
                  style={{ color: a.todayActive ? a.text : 'var(--muted-foreground)' }}>{a.label}</span>
                <div style={{ color: a.todayActive ? a.text : 'var(--muted-foreground)' }}>{a.todaySub}</div>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
