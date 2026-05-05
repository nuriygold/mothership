'use client';

const PROJECTS_SYNC_KEY = 'projects:last-updated-at';
const PROJECTS_SYNC_EVENT = 'projects:updated';

export function readProjectsSyncStamp(): number {
  if (typeof window === 'undefined') return 0;
  const raw = window.localStorage.getItem(PROJECTS_SYNC_KEY);
  const stamp = raw ? Number(raw) : 0;
  return Number.isFinite(stamp) ? stamp : 0;
}

export function broadcastProjectsUpdated() {
  if (typeof window === 'undefined') return;
  const stamp = Date.now();
  window.localStorage.setItem(PROJECTS_SYNC_KEY, String(stamp));
  window.dispatchEvent(new CustomEvent(PROJECTS_SYNC_EVENT, { detail: { stamp } }));
}

export function onProjectsUpdated(handler: () => void) {
  if (typeof window === 'undefined') return () => {};

  const customListener = () => handler();
  const storageListener = (event: StorageEvent) => {
    if (event.key === PROJECTS_SYNC_KEY) handler();
  };

  window.addEventListener(PROJECTS_SYNC_EVENT, customListener);
  window.addEventListener('storage', storageListener);

  return () => {
    window.removeEventListener(PROJECTS_SYNC_EVENT, customListener);
    window.removeEventListener('storage', storageListener);
  };
}
