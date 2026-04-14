'use client';

import { useEffect, useRef, useState, type ElementType, type ReactNode } from 'react';
import { Droplets, Footprints, Dumbbell, Heart, BookOpen, Pill } from 'lucide-react';
import { supabase } from '@/lib/supabase';

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

// Tracks when we last saved locally so we can compare against Supabase's updated_at.
// Stored separately to avoid changing the wellness data format.
function wellnessSavedAtKey() {
  return `wellness-savedAt-${easternDateString(0)}`;
}

function loadWellness(): WellnessState {
  if (typeof window === 'undefined') return WELLNESS_DEFAULT;
  try {
    const s = localStorage.getItem(wellnessKey());
    return s ? { ...WELLNESS_DEFAULT, ...JSON.parse(s) } : WELLNESS_DEFAULT;
  } catch { return WELLNESS_DEFAULT; }
}

function loadLocalSavedAt(): string | null {
  try { return localStorage.getItem(wellnessSavedAtKey()); } catch { return null; }
}

function saveWellness(s: WellnessState) {
  try {
    localStorage.setItem(wellnessKey(), JSON.stringify(s));
    // Record when we last wrote locally so Supabase can only win if it's newer.
    localStorage.setItem(wellnessSavedAtKey(), new Date().toISOString());
  } catch { /**/ }
}

async function fetchFromSupabase(date: string): Promise<{ state: WellnessState; updatedAt: string } | null> {
  const { data, error } = await supabase
    .from('wellness_logs')
    .select('water, steps, workout, prayer, journal, vitamins, updated_at')
    .eq('date', date)
    .maybeSingle();
  if (error || !data) return null;
  return {
    state: {
      water: data.water,
      steps: data.steps,
      workout: data.workout,
      prayer: data.prayer,
      journal: data.journal,
      vitamins: data.vitamins ?? false,
    },
    updatedAt: data.updated_at as string,
  };
}

// Syncs to Supabase with up to `retries` attempts (1 s apart).
// localStorage always has the correct state; Supabase is the cross-device store.
async function syncToSupabase(state: WellnessState, retries = 2): Promise<void> {
  try {
    const { error } = await supabase.from('wellness_logs').upsert(
      { date: todayDate(), ...state, updated_at: new Date().toISOString() },
      { onConflict: 'date' }
    );
    if (error) throw error;
  } catch {
    if (retries > 0) {
      await new Promise<void>((r) => setTimeout(r, 1000));
      return syncToSupabase(state, retries - 1);
    }
    // All retries exhausted — localStorage still holds the correct data and
    // the savedAt timestamp will protect it from being overwritten on the next load.
  }
}

export function WellnessAnchors({ onAllComplete }: { onAllComplete?: () => void } = {}) {
  const [w, setW] = useState<WellnessState>(WELLNESS_DEFAULT);
  const [yw, setYw] = useState<WellnessState>(WELLNESS_DEFAULT);
  const [celebrate, setCelebrate] = useState(false);
  const celebrateTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const local = loadWellness();
    const localSavedAt = loadLocalSavedAt();
    setW(local);

    const ydate = yesterdayDate();
    const tdate = todayDate();

    Promise.all([
      fetchFromSupabase(tdate),
      fetchFromSupabase(ydate),
    ]).then(([remote, remoteYesterday]) => {
      // Today — Supabase wins only if its data is newer than our last local save.
      // This prevents the Supabase fetch from overwriting edits the user made
      // before the fetch completed, while still keeping cross-device data fresh.
      if (remote) {
        const supabaseNewer = !localSavedAt || remote.updatedAt > localSavedAt;
        if (supabaseNewer) {
          setW(remote.state);
          saveWellness(remote.state);
        }
      }

      // Yesterday — read-only; use Supabase, fall back to localStorage snapshot.
      const ylocal = (() => {
        try {
          const s = localStorage.getItem(`wellness-${ydate}`);
          return s ? { ...WELLNESS_DEFAULT, ...JSON.parse(s) } : null;
        } catch { return null; }
      })();
      setYw(remoteYesterday?.state ?? ylocal ?? WELLNESS_DEFAULT);
    });
  }, []);

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
      todaySub: <span className="text-[8px]">{w.steps}k</span>,
      ydaySub: <span className="text-[8px]">{yw.steps}k</span>,
      onTap: () => update({ steps: w.steps >= 10 ? 0 : w.steps + 1 }),
    },
    {
      key: 'workout', label: 'Move', icon: Dumbbell,
      bg: 'var(--color-peach)', text: 'var(--color-peach-text)',
      todayActive: w.workout, ydayActive: yw.workout,
      todaySub: <span className="text-[8px]">{w.workout ? '✓' : '—'}</span>,
      ydaySub: <span className="text-[8px]">{yw.workout ? '✓' : '—'}</span>,
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
        {celebrate && <span className="text-lg animate-bounce">🎉</span>}
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
