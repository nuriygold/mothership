'use client';

import { titleFromText } from '@/lib/chat/title';

const TITLES_UPDATED_EVENT = 'chat-tabs:titles-updated';
const PINS_UPDATED_EVENT = 'chat-tabs:pins-updated';

export function titlesKey(agent: string): string {
  return `chat-tabs:${agent}:titles`;
}

export function sessionsKey(agent: string): string {
  return `chat-tabs:${agent}:sessions`;
}

export function pinnedKey(agent: string): string {
  return `chat-tabs:${agent}:pinned`;
}

export function readTitles(agent: string): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = JSON.parse(window.localStorage.getItem(titlesKey(agent)) ?? '{}');
    return raw && typeof raw === 'object' ? (raw as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function writeTitles(agent: string, titles: Record<string, string>) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(titlesKey(agent), JSON.stringify(titles));
  window.dispatchEvent(new CustomEvent(TITLES_UPDATED_EVENT, { detail: { agent } }));
}

export function readPinned(agent: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = JSON.parse(window.localStorage.getItem(pinnedKey(agent)) ?? '[]');
    return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function writePinned(agent: string, pinned: string[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(pinnedKey(agent), JSON.stringify(pinned));
  window.dispatchEvent(new CustomEvent(PINS_UPDATED_EVENT, { detail: { agent } }));
}

/**
 * If the session has no local title yet, derive one from the first user
 * message and store it. No-op if a title already exists. Returns the
 * resulting title (or null).
 */
export function maybeAutoTitle(agent: string, sessionId: string, firstUserMessage: string): string | null {
  if (!sessionId) return null;
  const current = readTitles(agent);
  if (current[sessionId]) return current[sessionId];
  const derived = titleFromText(firstUserMessage);
  if (!derived) return null;
  writeTitles(agent, { ...current, [sessionId]: derived });
  return derived;
}

export function onTitlesUpdated(agent: string, handler: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const listener = (e: Event) => {
    const detail = (e as CustomEvent).detail as { agent?: string } | undefined;
    if (!detail || detail.agent === agent) handler();
  };
  const storageListener = (e: StorageEvent) => {
    if (e.key === titlesKey(agent)) handler();
  };
  window.addEventListener(TITLES_UPDATED_EVENT, listener);
  window.addEventListener('storage', storageListener);
  return () => {
    window.removeEventListener(TITLES_UPDATED_EVENT, listener);
    window.removeEventListener('storage', storageListener);
  };
}

export function onPinsUpdated(agent: string, handler: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const listener = (e: Event) => {
    const detail = (e as CustomEvent).detail as { agent?: string } | undefined;
    if (!detail || detail.agent === agent) handler();
  };
  const storageListener = (e: StorageEvent) => {
    if (e.key === pinnedKey(agent)) handler();
  };
  window.addEventListener(PINS_UPDATED_EVENT, listener);
  window.addEventListener('storage', storageListener);
  return () => {
    window.removeEventListener(PINS_UPDATED_EVENT, listener);
    window.removeEventListener('storage', storageListener);
  };
}
