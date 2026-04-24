'use client';

import { useEffect, useState } from 'react';
import type { StressSummary } from '@/lib/oura';

type TimeOfDay = 'morning' | 'afternoon' | 'evening';

function getTimeOfDay(): TimeOfDay {
  const hour = new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/New_York' });
  const h = parseInt(hour, 10);
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

const MESSAGES: Record<StressSummary, Record<TimeOfDay, string[]>> = {
  restored: {
    morning: [
      "Good morning, {name}. The ring has nothing but good news so far. Zero stress. Start right here.",
      "Morning, {name}. Clean slate, no stress yet. The day is entirely yours.",
      "You are starting fresh, {name}. Not a stressful minute on the books. Stay easy.",
      "The ring is quiet this morning, {name}. No stress at all. A beautiful way to begin.",
    ],
    afternoon: [
      "It is the afternoon, {name}, and you have not had a single stressful minute today. You are in the vortex. Stay there.",
      "Look at you, {name}. Halfway through the day and still in the clear. The ring is impressed.",
      "Smooth sailing this afternoon, {name}. Your ring sees zero stress. Keep the pace.",
      "Midday and spotless, {name}. No stress anywhere on the ring's radar. That is a real thing.",
    ],
    evening: [
      "What a day, {name}. Your ring barely registered a stressful minute. That is the kind of day worth remembering.",
      "Evening, {name}. You made it through with barely any stress at all. Rest well tonight.",
      "You closed the day clean, {name}. The ring saw it all. Barely any stress to report.",
      "The ring is giving you high marks tonight, {name}. A calm day from start to finish.",
    ],
  },
  normal: {
    morning: [
      "Morning, {name}. A little stress already, but nothing the ring is worried about. You have got this.",
      "The day is just getting started, {name}, and your ring shows a bit of stress. Totally normal. Breathe.",
      "Good morning, {name}. A touch of stress on the board, but well within range. Keep going.",
      "The ring picked up some stress early, {name}. It happens. Nothing to course-correct just yet.",
    ],
    afternoon: [
      "Good afternoon, {name}. Your ring shows a couple hours of stress so far. Nothing out of the ordinary. You are handling it.",
      "Midday check-in, {name}. Some stress on the books but nothing alarming. Right in the middle of a normal day.",
      "The afternoon is humming along, {name}. Your ring sees some stress, but it is the ordinary kind. Keep moving.",
      "Your ring has clocked some stress this afternoon, {name}. Nothing worth stopping for. Stay in it.",
    ],
    evening: [
      "You are winding down, {name}, and the ring shows a pretty typical day for stress. Nothing to worry about tonight.",
      "Evening, {name}. Normal stress levels all day. The ring thinks you did just fine.",
      "Closing out the day, {name}. Some stress came and went, as it does. The ring calls it normal.",
      "The ring tracked a standard day, {name}. Some stress, some recovery. That is life. Rest now.",
    ],
  },
  stressful: {
    morning: [
      "Morning, {name}. The ring is already picking up some heat. It is early. Try to slow it down before it compounds.",
      "Heads up, {name}. High stress showing up early this morning. Give yourself a moment before the day takes off.",
      "The ring is flagging some stress already, {name}. It is still morning. A good time to reset.",
      "Starting with some tension, {name}. The ring sees it. Take a breath and try to reset before noon.",
    ],
    afternoon: [
      "It has been a full one, {name}. Your ring has counted hours of high stress already. Time to step back, even for ten minutes.",
      "Afternoon check-in, {name}. The ring has been tracking a lot of stress today. Worth paying attention to.",
      "High stress afternoon, {name}. The ring sees it. Maybe close a tab, take a walk, drink some water.",
      "Your ring is waving a flag, {name}. A lot of high stress this afternoon. Time to find ten minutes of quiet.",
    ],
    evening: [
      "It has been a lot today, {name}. Your ring counted several hours of high stress. You have earned the quiet tonight.",
      "The ring tracked a heavy day, {name}. Time to wind all the way down. You did what you could.",
      "Evening, {name}. High stress all day, says the ring. Let it go now. Rest is the move.",
      "The ring saw a tough one today, {name}. Time to close the tabs, put the phone down, and recover.",
    ],
  },
};

const STYLES: Record<StressSummary, { bg: string; border: string; accent: string; label: string }> = {
  restored: {
    bg: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
    border: '#86efac',
    accent: '#16a34a',
    label: 'Restored',
  },
  normal: {
    bg: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
    border: '#fcd34d',
    accent: '#d97706',
    label: 'Normal',
  },
  stressful: {
    bg: 'linear-gradient(135deg, #fff1f2 0%, #ffe4e6 100%)',
    border: '#fca5a5',
    accent: '#dc2626',
    label: 'Stressful',
  },
};

interface Props {
  summary: StressSummary;
  stressHighMinutes: number;
  userName?: string;
}

export function StressCard({ summary, stressHighMinutes: _stressHighMinutes, userName = 'Rudolph' }: Props) {
  const [message, setMessage] = useState('');

  useEffect(() => {
    const time = getTimeOfDay();
    const pool = MESSAGES[summary][time];
    const picked = pool[Math.floor(Math.random() * pool.length)];
    setMessage(picked.replace(/\{name\}/g, userName));
  }, [summary, userName]);

  const style = STYLES[summary];

  if (!message) return null;

  return (
    <div
      style={{
        background: style.bg,
        border: `1.5px solid ${style.border}`,
        borderRadius: 20,
        padding: '20px 24px 16px',
        boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
      }}
    >
      <p
        style={{
          fontSize: 26,
          color: '#2d2a24',
          lineHeight: 1.6,
          margin: 0,
          fontFamily: '"Brush Script MT", "Segoe Script", cursive',
        }}
      >
        {message}
      </p>
      <p
        style={{
          fontSize: 10,
          letterSpacing: 1.5,
          textTransform: 'uppercase',
          color: style.accent,
          marginTop: 10,
          fontWeight: 600,
        }}
      >
        {style.label} · Oura
      </p>
    </div>
  );
}
