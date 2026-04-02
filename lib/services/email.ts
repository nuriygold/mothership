import { ImapFlow } from 'imapflow';

type EmailProvider = 'gmail' | 'zoho' | 'outlook' | 'none';

export type EmailSummary = {
  provider: EmailProvider;
  inboxes: string[];
  connected: boolean;
  unreadCount: number;
  needsReplyCount: number;
  urgentCount: number;
  note: string;
  previews: Array<{
    id: string;
    from: string;
    subject: string;
    date: string;
  }>;
};

function parseInboxes(raw: string | undefined) {
  if (!raw) return [];
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

async function fetchZohoCounts() {
  const host = process.env.ZOHO_IMAP_HOST || 'imap.zoho.com';
  const port = Number(process.env.ZOHO_IMAP_PORT || 993);
  const auth = {
    user: process.env.ZOHO_IMAP_USERNAME || '',
    pass: process.env.ZOHO_IMAP_PASSWORD || '',
  };

  if (!auth.user || !auth.pass) {
    return { connected: false, unread: 0, needsReply: 0, urgent: 0, note: 'Zoho credentials missing' };
  }

  const client = new ImapFlow({
    host,
    port,
    secure: true,
    auth,
    logger: false,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    await client.connect();
    await client.selectMailbox('INBOX');

    const unseen = await client.search({ seen: false }, { uid: true, signal: controller.signal });
    const unread = unseen.length;

    const urgentMatches = await client.search(
      { seen: false, header: ['Subject', 'urgent'] },
      { uid: true, signal: controller.signal }
    );
    const urgent = urgentMatches.length;

    const previews: EmailSummary['previews'] = [];
    const fetchResults = client.fetch(
      unseen.slice(-10),
      { envelope: true, source: false, bodyStructure: false },
      { signal: controller.signal }
    );

    for await (const message of fetchResults) {
      const env = message.envelope;
      previews.push({
        id: String(message.uid ?? message.seq ?? Math.random()),
        from: env?.from?.[0]?.address ?? env?.from?.[0]?.name ?? 'Unknown',
        subject: env?.subject ?? '(no subject)',
        date: env?.date ? new Date(env.date).toISOString() : new Date().toISOString(),
      });
      if (previews.length >= 5) break;
    }

    await client.logout();

    return {
      connected: true,
      unread,
      needsReply: unread, // heuristic until answered status is parsed
      urgent,
      previews,
      note: 'Live Zoho IMAP counts (unread/urgent).',
    };
  } catch (err) {
    try {
      if (client?.loggedIn) await client.logout();
    } catch (_e) {
      // ignore secondary logout errors
    }
    return {
      connected: false,
      unread: 0,
      needsReply: 0,
      urgent: 0,
      previews: [],
      note: `Zoho IMAP error: ${String(err).slice(0, 140)}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function getEmailSummary(): Promise<EmailSummary> {
  const provider = ((process.env.EMAIL_PROVIDER ?? 'gmail').toLowerCase() as EmailProvider) || 'none';
  const inboxes = parseInboxes(process.env.EMAIL_INBOXES);

  // v1 connector posture: we treat credentials as "connected" once server-side OAuth
  // values are present. Live mailbox sync will be implemented in Phase 4.
  const hasGmailCreds = Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REFRESH_TOKEN
  );

  const hasZohoCreds = Boolean(process.env.ZOHO_IMAP_USERNAME && process.env.ZOHO_IMAP_PASSWORD);

  const connected =
    provider === 'gmail'
      ? hasGmailCreds
      : provider === 'zoho'
        ? hasZohoCreds
      : provider === 'outlook'
        ? false
        : provider === 'none'
          ? false
          : false;

  if (provider === 'zoho') {
    const zoho = await fetchZohoCounts();
    return {
      provider,
      inboxes,
      connected: zoho.connected,
      unreadCount: zoho.unread,
      needsReplyCount: zoho.needsReply,
      urgentCount: zoho.urgent,
      previews: zoho.previews ?? [],
      note: zoho.note,
    };
  }

  return {
    provider,
    inboxes,
    connected,
    unreadCount: 0,
    needsReplyCount: 0,
    urgentCount: 0,
    previews: [],
    note: connected
      ? 'Mailbox connector credentials are present. Live thread sync is next.'
      : provider === 'gmail'
        ? 'Email connector not fully configured yet. Add Gmail OAuth env vars to enable sync.'
        : 'Email connector not fully configured yet. Add provider credentials to enable sync.',
  };
}
