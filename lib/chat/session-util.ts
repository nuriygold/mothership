import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { chatSessions } from '@/lib/db/schema';
import { titleFromText } from '@/lib/chat/title';

export { titleFromText };

/**
 * Upsert a ChatSession. On create, auto-generate a title from the given text
 * (if no explicit title). On update, only bump updatedAt — never overwrite a
 * user-authored title.
 */
export async function ensureSession(
  sessionId: string,
  opts: { firstMessageText?: string; title?: string | null } = {}
) {
  if (!sessionId) return;
  const title =
    typeof opts.title === 'string' && opts.title.trim()
      ? opts.title.trim().slice(0, 80)
      : titleFromText(opts.firstMessageText ?? '');

  try {
    const now = new Date();
    await db
      .insert(chatSessions)
      .values({ id: sessionId, title, updatedAt: now })
      .onConflictDoUpdate({
        target: chatSessions.id,
        set: { updatedAt: now },
      });
  } catch {
    // Swallow — persistence is best-effort for chat.
  }
}
