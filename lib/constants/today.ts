import { CheckCircle2, Clock, Sparkles, Zap, Target } from 'lucide-react';

export const BOT_CANONICAL_NAME: Record<string, string> = {
  Drake: 'Drake',
  Adrian: 'Drake',
  Drizzy: 'Drizzy',
  Ruby: 'Drizzy',
  'Champagne Papi': 'Champagne Papi',
  Emerald: 'Champagne Papi',
  'Aubrey Graham': 'Aubrey Graham',
  Adobe: 'Aubrey Graham',
  'Adobe Pettaway': 'Aubrey Graham',
  '6 God': '6 God',
  Anchor: '6 God',
};

export function normalizeBotName(name: string): string {
  return BOT_CANONICAL_NAME[name] ?? name;
}

export const BOT_TELEGRAM_KEY: Record<string, string> = {
  Drake: 'bot1',
  Drizzy: 'bot2',
  'Champagne Papi': 'bot3',
  'Aubrey Graham': 'botAdobe',
  '6 God': 'botAnchor',
};

export const BOT_OWNER_LOGIN: Record<string, string> = Object.fromEntries(
  Object.keys(BOT_CANONICAL_NAME).map((name) => [name, normalizeBotName(name).toLowerCase()])
) as Record<string, string>;

export const ALL_BOTS = ['Drake', 'Drizzy', 'Champagne Papi', 'Aubrey Graham', '6 God'];

export const BOT_COLORS: Record<string, { bg: string; text: string }> = {
  Drake: { bg: 'var(--color-peach)', text: 'var(--color-peach-text)' },
  Drizzy: { bg: 'var(--color-pink)', text: 'var(--color-pink-text)' },
  'Champagne Papi': { bg: 'var(--color-mint)', text: 'var(--color-mint-text)' },
  'Aubrey Graham': { bg: 'var(--color-lemon)', text: 'var(--color-lemon-text)' },
  '6 God': { bg: 'var(--color-lavender)', text: 'var(--color-lavender-text)' },
};

export const APPROVAL_BG: Record<string, string> = {
  email: 'var(--color-lavender)',
  finance: 'var(--color-mint)',
  tasks: 'var(--color-sky)',
  other: 'var(--color-peach)',
};

export const APPROVAL_TEXT: Record<string, string> = {
  email: 'var(--color-lavender-text)',
  finance: 'var(--color-mint-text)',
  tasks: 'var(--color-sky-text)',
  other: 'var(--color-peach-text)',
};

export const BOT_BORDER: Record<string, string> = {
  Drake: '#E53E3E',
  Drizzy: 'var(--color-purple)',
  'Champagne Papi': 'var(--color-cyan)',
  'Aubrey Graham': '#FFB800',
  '6 God': '#8A6DFF',
  default: 'var(--color-purple)',
};

export const TIMELINE_ICON_MAP = {
  check: CheckCircle2,
  clock: Clock,
  alert: Sparkles,
  spark: Zap,
  focus: Target,
};
