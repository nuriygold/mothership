import { CheckCircle2, Clock, Sparkles, Zap, Target } from 'lucide-react';

export const BOT_CANONICAL_NAME: Record<string, string> = {
  Adrian: 'Adrian',
  Ruby: 'Ruby',
  Emerald: 'Emerald',
  Adobe: 'Adobe',
  'Adobe Pettaway': 'Adobe',
};

export function normalizeBotName(name: string): string {
  return BOT_CANONICAL_NAME[name] ?? name;
}

export const BOT_TELEGRAM_KEY: Record<string, string> = {
  Adrian: 'bot1',
  Ruby: 'bot2',
  Emerald: 'bot3',
  Adobe: 'botAdobe',
  'Adobe Pettaway': 'botAdobe',
};

export const BOT_OWNER_LOGIN: Record<string, string> = {
  Adrian: 'adrian',
  Ruby: 'ruby',
  Emerald: 'emerald',
  Adobe: 'adobe',
  'Adobe Pettaway': 'adobe',
};

export const ALL_BOTS = ['Adrian', 'Ruby', 'Emerald', 'Adobe'];

export const BOT_COLORS: Record<string, { bg: string; text: string }> = {
  Adrian: { bg: 'var(--color-peach)', text: 'var(--color-peach-text)' },
  Ruby: { bg: 'var(--color-pink)', text: 'var(--color-pink-text)' },
  Emerald: { bg: 'var(--color-mint)', text: 'var(--color-mint-text)' },
  Adobe: { bg: 'var(--color-lemon)', text: 'var(--color-lemon-text)' },
  'Adobe Pettaway': { bg: 'var(--color-lemon)', text: 'var(--color-lemon-text)' },
};

export const APPROVAL_BG: Record<string, string> = {
  email: 'var(--color-lavender)',
  finance: 'var(--color-peach)',
  tasks: 'var(--color-mint)',
  other: 'var(--color-sky)',
};

export const APPROVAL_TEXT: Record<string, string> = {
  email: 'var(--color-lavender-text)',
  finance: 'var(--color-peach-text)',
  tasks: 'var(--color-mint-text)',
  other: 'var(--color-sky-text)',
};

export const BOT_BORDER: Record<string, string> = {
  Adrian: '#E53E3E',
  Ruby: 'var(--color-purple)',
  Emerald: 'var(--color-cyan)',
  Adobe: '#FFB800',
  default: 'var(--color-purple)',
};

export const TIMELINE_ICON_MAP = {
  check: CheckCircle2,
  clock: Clock,
  alert: Sparkles,
  spark: Zap,
  focus: Target,
};
