'use client';

import { useEffect, useRef, useState } from 'react';
import { Droplets, Footprints, Dumbbell, Heart, BookOpen } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface WellnessState {
  water: number;    // 0–8 glasses
  steps: number;    // 0–10 (thousands of steps)
  workout: boolean;
  prayer: boolean;
  journal: boolean;
}

const WELLNESS_DEFAULT: WellnessState = { water: 0, steps: 0, workout: false, prayer: false, journal: false };

function todayDate() {
  return new Date().toISOString().split('T')[0]; // "2026-04-08"
}

function wellnessKey() { return `wellness-${new Date().toDateString()}`; }

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

async function fetchFromSupabase(): Promise<WellnessState | null> {
  const { data, error } = await supabase
    .from('wellness_logs')
    .select('water, steps, workout, prayer, journal')
    .eq('date', todayDate())
    .maybeSingle();
  if (error || !data) return null;
  return {
    water: data.water,
    steps: data.steps,
    workout: data.workout,
    prayer: data.prayer,
    journal: data.journal,
  };
}

async function syncToSupabase(state: WellnessState) {
  await supabase.from('wellness_logs').upsert(
    { date: todayDate(), ...state, updated_at: new Date().toISOString() },
    { onConflict: 'date' }
  );
}

export function WellnessAnchors() {
  const [w, setW] = useState<WellnessState>(WELLNESS_DEFAULT);
  const [celebrate, setCelebrate] = useState(false);
  const celebrateTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    // Load localStorage immediately for instant render
    const local = loadWellness();
    setW(local);

    // Then fetch from Supabase — overrides local if server has more recent data
    fetchFromSupabase().then((remote) => {
      if (remote) {
        setW(remote);
        saveWellness(remote); // keep localStorage in sync
      }
    });
  }, []);

  useEffect(() => () => clearTimeout(celebrateTimer.current), []);

  function update(patch: Partial<WellnessState>) {
    setW((prev) => {
      const next = { ...prev, ...patch };
      saveWellness(next);
      void syncToSupabase(next); // fire-and-forget — localStorage already updated
      const allDone = next.water >= 8 && next.steps >= 10 && next.workout && next.prayer && next.journal;
      if (allDone) {
        setCelebrate(true);
        clearTimeout(celebrateTimer.current);
        celebrateTimer.current = setTimeout(() => setCelebrate(false), 1800);
      }
      return next;
    });
  }

  const done = [w.water >= 8, w.steps >= 10, w.workout, w.prayer, w.journal].filter(Boolean).length;
  const pct = (done / 5) * 100;

  // SVG ring dimensions
  const r = 16; const circ = 2 * Math.PI * r;

  const anchors = [
    {
      key: 'water', label: 'Water', icon: Droplets,
      active: w.water >= 8, bg: 'var(--color-sky)', text: 'var(--color-sky-text)',
      sub: (
        <span className="flex gap-0.5 flex-wrap justify-center mt-0.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <span key={i} className="w-1.5 h-1.5 rounded-full transition-all"
              style={{ background: i < w.water ? 'var(--color-sky-text)' : 'var(--border)' }} />
          ))}
        </span>
      ),
      onTap: () => update({ water: w.water >= 8 ? 0 : w.water + 1 }),
    },
    {
      key: 'steps', label: 'Steps', icon: Footprints,
      active: w.steps >= 10, bg: 'var(--color-mint)', text: 'var(--color-mint-text)',
      sub: <span className="text-[9px]">{w.steps}k / 10k</span>,
      onTap: () => update({ steps: w.steps >= 10 ? 0 : w.steps + 1 }),
    },
    {
      key: 'workout', label: 'Move', icon: Dumbbell,
      active: w.workout, bg: 'var(--color-peach)', text: 'var(--color-peach-text)',
      sub: <span className="text-[9px]">{w.workout ? 'Done ✓' : 'Tap to log'}</span>,
      onTap: () => update({ workout: !w.workout }),
    },
    {
      key: 'prayer', label: 'Prayer', icon: Heart,
      active: w.prayer, bg: 'var(--color-lavender)', text: 'var(--color-lavender-text)',
      sub: <span className="text-[9px]">{w.prayer ? 'Done ✓' : 'Tap to log'}</span>,
      onTap: () => update({ prayer: !w.prayer }),
    },
    {
      key: 'journal', label: 'Journal', icon: BookOpen,
      active: w.journal, bg: 'var(--color-lemon)', text: 'var(--color-lemon-text)',
      sub: <span className="text-[9px]">{w.journal ? 'Done ✓' : 'Tap to log'}</span>,
      onTap: () => update({ journal: !w.journal }),
    },
  ];

  return (
    <div className="rounded-3xl border p-4 transition-all"
      style={{
        background: celebrate ? 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 50%, #fde68a 100%)' : 'var(--card)',
        borderColor: celebrate ? '#F59E0B' : 'var(--border)',
      }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {/* SVG progress ring */}
          <svg width="40" height="40" viewBox="0 0 40 40" className="-rotate-90">
            <circle cx="20" cy="20" r={r} fill="none" stroke="var(--border)" strokeWidth="3" />
            <circle cx="20" cy="20" r={r} fill="none"
              stroke={done === 5 ? '#F59E0B' : 'var(--color-cyan)'}
              strokeWidth="3"
              strokeDasharray={circ}
              strokeDashoffset={circ - (circ * pct) / 100}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 0.4s ease' }}
            />
            <text x="20" y="20" textAnchor="middle" dominantBaseline="central"
              className="rotate-90" style={{ fontSize: 10, fontWeight: 700, fill: done === 5 ? '#B45309' : 'var(--foreground)', transform: 'rotate(90deg)', transformOrigin: '20px 20px' }}>
              {done}/5
            </text>
          </svg>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted-foreground)' }}>Daily Anchors</p>
            <p className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
              {done === 5 ? '🏆 All done — you\'re on fire!' : `${5 - done} left today`}
            </p>
          </div>
        </div>
        {celebrate && <span className="text-lg animate-bounce">🎉</span>}
      </div>
      <div className="grid grid-cols-5 gap-2">
        {anchors.map((a) => {
          const Icon = a.icon;
          return (
            <button key={a.key} onClick={a.onTap}
              className="flex flex-col items-center gap-1 rounded-2xl py-3 px-1 transition-all hover:scale-105 active:scale-95"
              style={{
                background: a.active ? a.bg : 'var(--muted)',
                border: `1.5px solid ${a.active ? a.text : 'transparent'}`,
                boxShadow: a.active ? `0 2px 8px rgba(0,0,0,0.08)` : 'none',
              }}>
              <Icon className="w-4 h-4" style={{ color: a.active ? a.text : 'var(--muted-foreground)' }} />
              <span className="text-[10px] font-semibold leading-tight"
                style={{ color: a.active ? a.text : 'var(--muted-foreground)' }}>{a.label}</span>
              <div style={{ color: a.active ? a.text : 'var(--muted-foreground)' }}>{a.sub}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
