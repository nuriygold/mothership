/**
 * Produce a short human-readable title from the first user message.
 * Keeps the first 6 words, strips newlines, caps at 48 chars.
 *
 * NOTE: This file is intentionally free of server-only imports so it can be
 * imported from both client and server code.
 */
export function titleFromText(text: string): string | null {
  const normalized = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  const words = normalized.split(' ').slice(0, 6).join(' ');
  const truncated = words.length > 48 ? `${words.slice(0, 47).trim()}…` : words;
  return truncated || null;
}
