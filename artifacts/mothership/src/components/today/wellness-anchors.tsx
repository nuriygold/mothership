import { useEffect, useRef, useState, type ElementType, type ReactNode } from 'react';
import { Droplets, Footprints, Dumbbell, Heart, BookOpen, Pill } from 'lucide-react';
import { DEFAULT_APP_TIMEZONE } from '@/lib/constants/time';

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
  water: number;
  steps: number;
  workout: boolean;
  prayer: boolean;
  journal: boolean;
  vitamins: boolean;
}

const WELLNESS_DEFAULT: WellnessState = { water: 0, steps: 0, workout: false, prayer: false, journal: false, vitamins: false };

function easternDateString(offsetDays = 0): string {
  const d = new Date();
  if (offsetDays !== 0) d.setDate(d.getDate() + offsetDays);
  return d.toLocaleDateString('en-CA', { timeZone: DEFAULT_APP_TIMEZONE });
}

function todayDate() {
  return easternDateString(0);
}

function yesterdayDate() {
  return easternDateString(-1);
}

function wellnessKey(date = easternDateString(0)) {
  return 'wellness-' + date;
}

function wellnessSavedAtKey(date = easternDateString(0)) {
  return 'wellness-savedAt-' + date;
}

function loadWellness(date = easternDateString(0)): WellnessState {
  if (typeof window === 'undefined') return WELLNESS_DEFAULT;
  try {
    const s = localStorage.getItem(wellnessKey(date));
    return s ? { ...WELLNESS_DEFAULT, ...JSON.parse(s) } : WELLNESS_DEFAULT;
  } catch {
    return WELLNESS_DEFAULT;
  }
}

function loadSavedAt(date = easternDateString(0)): string | null {
  try {
    return localStorage.getItem(wellnessSavedAtKey(date));
  } catch {
    return null;
  }
}

function saveWellness(date: string, state: WellnessState, savedAt = new Date().toISOString()) {
  try {
    localStorage.setItem(wellnessKey(date), JSON.stringify(state));
    localStorage.setItem(wellnessSavedAtKey(date), savedAt);
  } catch {}
}

function isRemoteNewer(remoteUpdatedAt: string, localSavedAt: string | null) {
  if (!localSavedAt) return true;
  const remoteTs = new Date(remoteUpdatedAt).getTime();
  const localTs = new Date(localSavedAt).getTime();
  if (Number.isNaN(remoteTs)) return false;
  if (Number.isNaN(localTs)) return true;
  return remoteTs >= localTs;
}

async function fetchWellness(date: string): Promise<{ state: WellnessState; updatedAt: string } | null> {
  const response = await fetch('/api/v2/wellness?date=' + encodeURIComponent(date));
  if (!response.ok) {
    console.warn('[wellness] fetch failed', response.status, date);
    return null;
  }
  const payload = await response.json() as { log?: Record<string, unknown> | null };
  const data = payload.log;
  if (!data) return null;
  return {
    state: {
      water: typeof data.water === 'number' ? data.water : 0,
      steps: typeof data.steps === 'number' ? data.steps : 0,
      workout: data.workout === true,
      prayer: data.prayer === true,
      journal: data.journal === true,
      vitamins: data.vitamins === true,
    },
    updatedAt: typeof data.updated_at === 'string' ? data.updated_at : new Date(0).toISOString(),
  };
}

async function syncWellness(date: string, state: WellnessState, retries = 2): Promise<void> {
  try {
    const response = await fetch('/api/v2/wellness', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, ...state }),
    });
    if (!response.ok) throw new Error('wellness sync failed: ' + response.status);
    const payload = await response.json() as { log?: { updated_at?: string } | null };
    const updatedAt = payload.log?.updated_at ?? new Date().toISOString();
    saveWellness(date, state, updatedAt);
  } catch (error) {
    if (retries > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 1000));
      return syncWellness(date, state, retries - 1);
    }
    console.warn('[wellness] sync failed after retries', { date, error: error instanceof Error ? error.message : String(error) });
  }
}

export function WellnessAnchors({ onAllComplete }: { onAllComplete?: () => void } = {}) {
  const [w, setW] = useState<WellnessState>(WELLNESS_DEFAULT);
  const [yw, setYw] = useState<WellnessState>(WELLNESS_DEFAULT);
  const [celebrate, setCelebrate] = useState(false);
  const celebrateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const tdate = todayDate();
    const ydate = yesterdayDate();
    setW(loadWellness(tdate));
    setYw(loadWellness(ydate));
    Promise.all([fetchWellness(tdate), fetchWellness(ydate)])
      .then(([remoteToday, remoteYesterday]) => {
        if (remoteToday && isRemoteNewer(remoteToday.updatedAt, loadSavedAt(tdate))) {
          setW(remoteToday.state);
          saveWellness(tdate, remoteToday.state, remoteToday.updatedAt);
        }
        if (remoteYesterday && isRemoteNewer(remoteYesterday.updatedAt, loadSavedAt(ydate))) {
          setYw(remoteYesterday.state);
          saveWellness(ydate, remoteYesterday.state, remoteYesterday.updatedAt);
        }
      })
      .catch((error) => {
        console.warn('[wellness] hydration failed', error instanceof Error ? error.message : String(error));
      });
  }, []);

  useEffect(() => () => {
    if (celebrateTimer.current) clearTimeout(celebrateTimer.current);
  }, []);

  function update(patch: Partial<WellnessState>) {
    const tdate = todayDate();
    setW((prev) => {
      const next = { ...prev, ...patch };
      saveWellness(tdate, next);
      void syncWellness(tdate, next);
      const wasAllDone = prev.water >= 8 && prev.steps >= 10 && prev.workout && prev.prayer && prev.journal && prev.vitamins;
      const allDone = next.water >= 8 && next.steps >= 10 && next.workout && next.prayer && next.journal && next.vitamins;
      if (allDone) {
        setCelebrate(true);
        if (celebrateTimer.current) clearTimeout(celebrateTimer.current);
        celebrateTimer.current = setTimeout(() => setCelebrate(false), 1800);
        if (!wasAllDone) {
          onAllComplete?.();
          void fetch('/api/v2/trophy/anchor', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date: tdate }),
          }).catch(() => {});
        }
      }
      return next;
    });
  }

  const done = [w.water >= 8, w.steps >= 10, w.workout, w.prayer, w.journal, w.vitamins].filter(Boolean).length;
  const pct = (done / 6) * 100;
  const r = 9;
  const circ = 2 * Math.PI * r;

  const anchors: AnchorDef[] = [
    {
      key: 'water', label: 'Water', icon: Droplets,
      bg: 'var(--color-sky)', text: 'var(--color-sky-text)',
      todayActive: w.water >= 8, ydayActive: yw.water >= 8,
      todaySub: (<span className="flex gap-0.5 flex-wrap justify-center mt-0.5">{Array.from({ length: 8 }).map((_, i) => (<span key={i} className="w-1 h-1 rounded-full transition-all" style={{ background: i < w.water ? 'var(--color-sky-text)' : 'var(--border)' }} />))}</span>),
      ydaySub: (<span className="flex gap-0.5 flex-wrap justify-center mt-0.5">{Array.from({ length: 8 }).map((_, i) => (<span key={i} className="w-1 h-1 rounded-full" style={{ background: i < yw.water ? 'var(--color-sky-text)' : 'var(--border)' }} />))}</span>),
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
    <div className="rounded-2xl border p-2 transition-all" style={{ background: celebrate ? 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 50%, #fde68a 100%)' : '#EDE8DC', borderColor: celebrate ? '#F59E0B' : 'var(--border)' }}>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <svg width="24" height="24" viewBox="0 0 24 24" className="-rotate-90">
            <circle cx="12" cy="12" r={r} fill="none" stroke="var(--border)" strokeWidth="2" />
            <circle cx="12" cy="12" r={r} fill="none" stroke={done === 6 ? '#F59E0B' : 'var(--color-cyan)'} strokeWidth="2" strokeDasharray={circ} strokeDashoffset={circ - (circ * pct) / 100} strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.4s ease' }} />
            <text x="12" y="12" textAnchor="middle" dominantBaseline="central" className="rotate-90" style={{ fontSize: 7, fontWeight: 700, fill: done === 6 ? '#B45309' : 'var(--foreground)', transform: 'rotate(90deg)', transformOrigin: '12px 12px' }}>
              {done}/6
            </text>
          </svg>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide leading-tight" style={{ color: 'var(--muted-foreground)' }}>Daily Anchors</p>
            <p className="text-[8px] leading-tight" style={{ color: 'var(--muted-foreground)' }}>
              {done === 6 ? '🏆 All done — you\'re on fire!' : (6 - done) + ' left today'}
            </p>
          </div>
        </div>
        {celebrate && <span className="text-sm animate-bounce">🎉</span>}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1">
        {anchors.map((a) => {
          const Icon = a.icon;
          return (
            <div key={a.key} className="rounded-xl overflow-hidden flex flex-col sm:flex-row" style={{ border: '1px solid ' + (a.todayActive ? a.text : 'transparent'), boxShadow: a.todayActive ? '0 1px 4px rgba(0,0,0,0.08)' : 'none' }}>
              <div className="flex flex-col items-center gap-0 py-1 px-0.5 flex-1 opacity-55" style={{ background: a.ydayActive ? a.bg : 'rgba(0,0,0,0.05)' }}>
                <span className="text-[6px] font-semibold uppercase tracking-wide" style={{ color: a.ydayActive ? a.text : 'var(--muted-foreground)' }}>Yday</span>
                <Icon className="w-2.5 h-2.5" style={{ color: a.ydayActive ? a.text : 'var(--muted-foreground)' }} />
                <span className="text-[7px] font-semibold leading-tight" style={{ color: a.ydayActive ? a.text : 'var(--muted-foreground)' }}>{a.label}</span>
                <div style={{ color: a.ydayActive ? a.text : 'var(--muted-foreground)' }}>{a.ydaySub}</div>
              </div>
              <div className="h-px w-full sm:h-auto sm:w-px" style={{ background: a.todayActive ? a.text : 'rgba(0,0,0,0.1)', opacity: 0.3 }} />
              <button onClick={a.onTap} className="flex flex-col items-center gap-0 py-1 px-0.5 transition-all hover:brightness-95 active:scale-95 flex-1" style={{ background: a.todayActive ? a.bg : 'var(--muted)' }}>
                <span className="text-[6px] font-semibold uppercase tracking-wide" style={{ color: a.todayActive ? a.text : 'var(--muted-foreground)' }}>Today</span>
                <Icon className="w-2.5 h-2.5" style={{ color: a.todayActive ? a.text : 'var(--muted-foreground)' }} />
                <span className="text-[7px] font-semibold leading-tight" style={{ color: a.todayActive ? a.text : 'var(--muted-foreground)' }}>{a.label}</span>
                <div style={{ color: a.todayActive ? a.text : 'var(--muted-foreground)' }}>{a.todaySub}</div>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
