import { google } from 'googleapis';
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

type LiveEmailCounts = {
  connected: boolean;
  unread: number;
  needsReply: number;
  urgent: number;
  previews: EmailSummary['previews'];
  note: string;
  inferredInbox?: string;
};

function parseInboxes(raw: string | undefined) {
  if (!raw) return [];
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs = 6000): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => reject(new Error('timeout')), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function getHeader(headers: Array<{ name?: string | null; value?: string | null }> | undefined, key: string) {
  if (!headers) return '';
  const match = headers.find((header) => header.name?.toLowerCase() === key.toLowerCase());
  return match?.value?.trim() ?? '';
}

function toIsoDate(input: string) {
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
}

function summarizeError(prefix: string, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes('invalid_grant')) {
    return `${prefix} refresh token expired or revoked. Reconnect Gmail OAuth.`;
  }
  if (message.includes('insufficient authentication scopes')) {
    return `${prefix} token missing gmail.readonly scope. Re-authorize OAuth credentials.`;
  }
  return `${prefix} error: ${message.slice(0, 140)}`;
}

async function fetchGmailCounts(inboxes: string[]): Promise<LiveEmailCounts> {
  const clientId = process.env.GOOGLE_CLIENT_ID || '';
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN || '';

  if (!clientId || !clientSecret || !refreshToken) {
    return {
      connected: false,
      unread: 0,
      needsReply: 0,
      urgent: 0,
      previews: [],
      note: 'Gmail OAuth credentials missing. Set GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN.',
    };
  }

  const oauth = new google.auth.OAuth2(clientId, clientSecret);
  oauth.setCredentials({ refresh_token: refreshToken });
  const gmail = google.gmail({ version: 'v1', auth: oauth });

  try {
    const profile = await withTimeout(gmail.users.getProfile({ userId: 'me' }));
    const inferredInbox = profile.data.emailAddress ?? undefined;

    const [unreadRes, needsReplyRes, urgentRes] = await Promise.all([
      withTimeout(gmail.users.messages.list({ userId: 'me', q: 'in:inbox is:unread', maxResults: 25 })),
      withTimeout(gmail.users.messages.list({ userId: 'me', q: 'in:inbox is:unread -from:me', maxResults: 25 })),
      withTimeout(
        gmail.users.messages.list({
          userId: 'me',
          q: 'in:inbox is:unread {subject:urgent subject:asap subject:"action required"}',
          maxResults: 25,
        })
      ),
    ]);

    const unreadMessages = unreadRes.data.messages ?? [];
    const previewIds = unreadMessages.slice(0, 5).map((message) => message.id).filter(Boolean) as string[];

    const previewResults = await Promise.all(
      previewIds.map(async (id) => {
        try {
          return await withTimeout(
            gmail.users.messages.get({
              userId: 'me',
              id,
              format: 'metadata',
              metadataHeaders: ['From', 'Subject', 'Date'],
            })
          );
        } catch (_err) {
          return null;
        }
      })
    );

    const previews: EmailSummary['previews'] = previewResults
      .filter((result): result is NonNullable<typeof result> => Boolean(result))
      .map((result, index) => {
        const headers = result.data.payload?.headers;
        const from = getHeader(headers, 'From') || 'Unknown sender';
        const subject = getHeader(headers, 'Subject') || '(no subject)';
        const rawDate = getHeader(headers, 'Date');
        return {
          id: result.data.id || `gmail-${index}`,
          from,
          subject,
          date: rawDate ? toIsoDate(rawDate) : new Date().toISOString(),
        };
      });

    const resolvedInboxes = inboxes.length > 0 ? inboxes : inferredInbox ? [inferredInbox] : [];
    const inboxNote = resolvedInboxes.length > 0 ? `Tracking: ${resolvedInboxes.join(', ')}` : 'Tracking primary Gmail inbox.';

    return {
      connected: true,
      unread: unreadMessages.length,
      needsReply: (needsReplyRes.data.messages ?? []).length,
      urgent: (urgentRes.data.messages ?? []).length,
      previews,
      note: `Live Gmail sync active. ${inboxNote}`,
      inferredInbox,
    };
  } catch (err) {
    return {
      connected: false,
      unread: 0,
      needsReply: 0,
      urgent: 0,
      previews: [],
      note: summarizeError('Gmail API', err),
    };
  }
}

async function fetchZohoCounts(): Promise<LiveEmailCounts> {
  const host = process.env.ZOHO_IMAP_HOST || 'imap.zoho.com';
  const port = Number(process.env.ZOHO_IMAP_PORT || 993);
  const auth = {
    user: process.env.ZOHO_IMAP_USERNAME || '',
    pass: process.env.ZOHO_IMAP_PASSWORD || '',
  };

  if (!auth.user || !auth.pass) {
    return { connected: false, unread: 0, needsReply: 0, urgent: 0, previews: [], note: 'Zoho credentials missing' };
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
  const configuredInboxes = parseInboxes(process.env.EMAIL_INBOXES);

  if (provider === 'zoho') {
    const zoho = await fetchZohoCounts();
    return {
      provider,
      inboxes: configuredInboxes,
      connected: zoho.connected,
      unreadCount: zoho.unread,
      needsReplyCount: zoho.needsReply,
      urgentCount: zoho.urgent,
      previews: zoho.previews ?? [],
      note: zoho.note,
    };
  }

  if (provider === 'gmail') {
    const gmail = await fetchGmailCounts(configuredInboxes);
    const resolvedInboxes =
      configuredInboxes.length > 0
        ? configuredInboxes
        : gmail.inferredInbox
          ? [gmail.inferredInbox]
          : [];

    return {
      provider,
      inboxes: resolvedInboxes,
      connected: gmail.connected,
      unreadCount: gmail.unread,
      needsReplyCount: gmail.needsReply,
      urgentCount: gmail.urgent,
      previews: gmail.previews,
      note: gmail.note,
    };
  }

  return {
    provider,
    inboxes: configuredInboxes,
    connected: false,
    unreadCount: 0,
    needsReplyCount: 0,
    urgentCount: 0,
    previews: [],
    note: 'Email connector not fully configured yet. Add provider credentials to enable sync.',
  };
}
