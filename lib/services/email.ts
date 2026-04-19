import nodemailer from 'nodemailer';
import { google } from 'googleapis';
import { ImapFlow } from 'imapflow';

type EmailProvider = 'gmail' | 'zoho' | 'both' | 'outlook' | 'none';

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
    snippet?: string;
    gmailLink?: string;
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

const GMAIL_WINDOW_DAYS = 30;
const GMAIL_MAX_COUNT_RESULTS = 300;
const GMAIL_MAX_PREVIEWS = 300;

function logEmailEvent(level: 'info' | 'warn' | 'error', event: string, data: Record<string, unknown> = {}) {
  const payload = {
    service: 'email',
    event,
    ...data,
    timestamp: new Date().toISOString(),
  };
  if (level === 'error') {
    console.error(JSON.stringify(payload));
    return;
  }
  if (level === 'warn') {
    console.warn(JSON.stringify(payload));
    return;
  }
  console.info(JSON.stringify(payload));
}

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

    const windowQuery = `newer_than:${GMAIL_WINDOW_DAYS}d`;
    const [inboxRes, needsReplyRes, urgentRes] = await Promise.all([
      withTimeout(
        gmail.users.messages.list({
          userId: 'me',
          q: `in:inbox ${windowQuery}`,
          maxResults: GMAIL_MAX_COUNT_RESULTS,
        })
      ),
      withTimeout(
        gmail.users.threads.list({
          userId: 'me',
          q: `in:inbox is:unread -from:me ${windowQuery}`,
          maxResults: GMAIL_MAX_COUNT_RESULTS,
        })
      ),
      withTimeout(
        gmail.users.messages.list({
          userId: 'me',
          q: `in:inbox ${windowQuery} {subject:urgent subject:asap subject:"action required"}`,
          maxResults: GMAIL_MAX_COUNT_RESULTS,
        })
      ),
    ]);

    const unreadMessages = inboxRes.data.messages ?? [];
    const previewIds = unreadMessages.slice(0, GMAIL_MAX_PREVIEWS).map((message) => message.id).filter(Boolean) as string[];

    const previewResults = await Promise.all(
      previewIds.map(async (id) => {
        try {
          return await withTimeout(
            gmail.users.messages.get({
              userId: 'me',
              id,
              format: 'metadata',
              metadataHeaders: ['From', 'Subject', 'Date', 'List-Unsubscribe'],
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
        const msgId = result.data.id || `gmail-${index}`;
        return {
          id: msgId,
          from,
          subject,
          date: rawDate ? toIsoDate(rawDate) : new Date().toISOString(),
          snippet: result.data.snippet ?? undefined,
          gmailLink: `https://mail.google.com/mail/u/0/#inbox/${msgId}`,
        };
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const resolvedInboxes = inboxes.length > 0 ? inboxes : inferredInbox ? [inferredInbox] : [];
    const inboxNote = resolvedInboxes.length > 0 ? `Tracking: ${resolvedInboxes.join(', ')}` : 'Tracking primary Gmail inbox.';

    logEmailEvent('info', 'gmail_sync_success', {
      unread: unreadMessages.length,
      needsReply: (needsReplyRes.data.threads ?? []).length,
      urgent: (urgentRes.data.messages ?? []).length,
      previewCount: previews.length,
      inferredInbox: inferredInbox ?? null,
      windowDays: GMAIL_WINDOW_DAYS,
    });

    return {
      connected: true,
      unread: unreadMessages.length,
      needsReply: (needsReplyRes.data.threads ?? []).length,
      urgent: (urgentRes.data.messages ?? []).length,
      previews,
      note: `Live Gmail sync active. ${inboxNote}`,
      inferredInbox,
    };
  } catch (err) {
    logEmailEvent('error', 'gmail_sync_failed', {
      error: err instanceof Error ? err.message : String(err),
    });
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
    logEmailEvent('warn', 'zoho_credentials_missing');
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
  const timeout = setTimeout(() => controller.abort(), 15000);

  const windowCutoff = new Date(Date.now() - GMAIL_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  try {
    await client.connect();
    await client.selectMailbox('INBOX');

    // Fetch all inbox messages within the date window (not just unread)
    const allInWindow = await client.search({ since: windowCutoff }, { uid: true, signal: controller.signal });
    const unreadInWindow = await client.search({ seen: false, since: windowCutoff }, { uid: true, signal: controller.signal });
    const unread = unreadInWindow.length;

    const urgentMatches = await client.search(
      { seen: false, since: windowCutoff, header: ['Subject', 'urgent'] },
      { uid: true, signal: controller.signal }
    );
    const urgent = urgentMatches.length;

    const previews: EmailSummary['previews'] = [];
    const fetchResults = client.fetch(
      allInWindow.slice(-GMAIL_MAX_PREVIEWS),
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
      if (previews.length >= GMAIL_MAX_PREVIEWS) break;
    }

    await client.logout();

    return {
      connected: true,
      unread,
      needsReply: unread,
      urgent,
      previews,
      note: `Live Zoho IMAP — ${previews.length} emails (last ${GMAIL_WINDOW_DAYS} days).`,
    };
  } catch (err) {
    logEmailEvent('error', 'zoho_sync_failed', {
      error: err instanceof Error ? err.message : String(err),
    });
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

  if (provider === 'both') {
    const [gmail, zoho] = await Promise.all([
      fetchGmailCounts(configuredInboxes),
      fetchZohoCounts(),
    ]);
    const mergedPreviews = [...gmail.previews, ...zoho.previews]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, GMAIL_MAX_PREVIEWS);
    const resolvedInboxes =
      configuredInboxes.length > 0
        ? configuredInboxes
        : gmail.inferredInbox
          ? [gmail.inferredInbox]
          : [];
    return {
      provider: 'both',
      inboxes: resolvedInboxes,
      connected: gmail.connected || zoho.connected,
      unreadCount: gmail.unread + zoho.unread,
      needsReplyCount: gmail.needsReply + zoho.needsReply,
      urgentCount: gmail.urgent + zoho.urgent,
      previews: mergedPreviews,
      note: [gmail.connected ? `Gmail: ${gmail.note}` : null, zoho.connected ? `Zoho: ${zoho.note}` : null].filter(Boolean).join(' | '),
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

export type ZohoSendOptions = { to: string; subject: string; body: string; inReplyTo?: string; references?: string; from?: string; };
export type ZohoSendResult = { ok: true; messageId: string } | { ok: false; error: string };

function getGmailOAuth() {
  const clientId = process.env.GOOGLE_CLIENT_ID || '';
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN || '';
  if (!clientId || !clientSecret || !refreshToken) return null;
  const oauth = new google.auth.OAuth2(clientId, clientSecret);
  oauth.setCredentials({ refresh_token: refreshToken });
  return google.gmail({ version: 'v1', auth: oauth });
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
}

function extractBodyFromPayload(payload: Record<string, unknown>): { html: string | null; text: string | null } {
  const result = { html: null as string | null, text: null as string | null };
  function walk(part: Record<string, unknown>) {
    if (!part) return;
    const mimeType = (part.mimeType as string) || '';
    const bodyData = ((part.body as Record<string, unknown>)?.data as string) ?? null;
    if (mimeType === 'text/html' && bodyData && !result.html) {
      result.html = decodeBase64Url(bodyData);
    } else if (mimeType === 'text/plain' && bodyData && !result.text) {
      result.text = decodeBase64Url(bodyData);
    }
    const parts = part.parts as Record<string, unknown>[] | undefined;
    if (parts) parts.forEach(walk);
  }
  walk(payload);
  return result;
}

const ACTION_LINK_PATTERNS = [
  /\brsvp\b/i, /\baccept\b/i, /\bdecline\b/i, /\bconfirm\b/i, /\battend\b/i,
  /add to calendar/i, /view invitation/i, /\brespond\b/i,
  /\bconnect\b/i, /accept invitation/i, /accept connection/i,
  /view on linkedin/i, /\bjoin\b/i, /\bverify\b/i,
];

export type ActionLink = { label: string; url: string };

export function extractActionLinks(html: string): ActionLink[] {
  const links: ActionLink[] = [];
  const seen = new Set<string>();
  const anchorRegex = /<a[^>]+href=["']([^"'#][^"']*?)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchorRegex.exec(html)) !== null) {
    const url = match[1].trim();
    const label = match[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (!url || url.startsWith('mailto:')) continue;
    if (seen.has(url)) continue;
    if (!ACTION_LINK_PATTERNS.some(p => p.test(label))) continue;
    seen.add(url);
    links.push({ label, url });
    if (links.length >= 8) break;
  }
  return links;
}

export type EmailFullBody = {
  html: string | null;
  text: string | null;
  actionLinks: ActionLink[];
};

export async function fetchGmailFullBody(messageId: string): Promise<EmailFullBody> {
  const gmail = getGmailOAuth();
  if (!gmail) return { html: null, text: null, actionLinks: [] };
  try {
    const result = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' });
    const payload = result.data.payload as Record<string, unknown> | undefined;
    if (!payload) return { html: null, text: null, actionLinks: [] };
    const body = extractBodyFromPayload(payload);
    return { ...body, actionLinks: body.html ? extractActionLinks(body.html) : [] };
  } catch (err) {
    logEmailEvent('error', 'gmail_full_body_fetch_failed', { messageId, error: err instanceof Error ? err.message : String(err) });
    return { html: null, text: null, actionLinks: [] };
  }
}

export async function fetchZohoFullBody(uid: string): Promise<EmailFullBody> {
  const host = process.env.ZOHO_IMAP_HOST || 'imap.zoho.com';
  const port = Number(process.env.ZOHO_IMAP_PORT || 993);
  const auth = { user: process.env.ZOHO_IMAP_USERNAME || '', pass: process.env.ZOHO_IMAP_PASSWORD || '' };
  if (!auth.user || !auth.pass) return { html: null, text: null, actionLinks: [] };

  const client = new ImapFlow({ host, port, secure: true, auth, logger: false });
  try {
    await client.connect();
    await client.selectMailbox('INBOX');
    const message = await client.fetchOne(uid, { bodyStructure: true, source: true }, { uid: true });
    await client.logout();
    if (!message?.source) return { html: null, text: null, actionLinks: [] };
    const raw = message.source.toString('utf-8');
    // Extract HTML part from raw RFC822 source via boundary splitting
    const htmlMatch = raw.match(/Content-Type:\s*text\/html[^\r\n]*\r?\n(?:.*\r?\n)*?\r?\n([\s\S]*?)(?=--|\z)/i);
    const textMatch = raw.match(/Content-Type:\s*text\/plain[^\r\n]*\r?\n(?:.*\r?\n)*?\r?\n([\s\S]*?)(?=--|\z)/i);
    const html = htmlMatch ? htmlMatch[1].trim() : null;
    const text = textMatch ? textMatch[1].trim() : null;
    return { html, text, actionLinks: html ? extractActionLinks(html) : [] };
  } catch (err) {
    logEmailEvent('error', 'zoho_full_body_fetch_failed', { uid, error: err instanceof Error ? err.message : String(err) });
    try { if (client?.loggedIn) await client.logout(); } catch (_e) { /* ignore */ }
    return { html: null, text: null, actionLinks: [] };
  }
}

export async function deleteGmailMessage(messageId: string): Promise<{ ok: boolean; error?: string }> {
  const gmail = getGmailOAuth();
  if (!gmail) return { ok: false, error: 'Gmail OAuth credentials missing.' };
  try {
    await gmail.users.messages.trash({ userId: 'me', id: messageId });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function getEmailListUnsubscribeUrl(messageId: string): Promise<string | null> {
  const gmail = getGmailOAuth();
  if (!gmail) return null;
  try {
    const result = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'metadata',
      metadataHeaders: ['List-Unsubscribe'],
    });
    const header = getHeader(result.data.payload?.headers, 'List-Unsubscribe');
    if (!header) return null;
    const urlMatch = header.match(/<(https?:[^>]+)>/);
    return urlMatch ? urlMatch[1] : null;
  } catch {
    return null;
  }
}

export async function sendGmailReply(options: { to: string; subject: string; body: string; inReplyTo?: string; references?: string }): Promise<ZohoSendResult> {
  const gmail = getGmailOAuth();
  if (!gmail) return { ok: false, error: 'Gmail OAuth credentials missing.' };
  try {
    const subject = options.subject.startsWith('Re:') ? options.subject : `Re: ${options.subject}`;
    const headers = [
      `To: ${options.to}`,
      `Subject: ${subject}`,
      `Content-Type: text/plain; charset=utf-8`,
      ...(options.inReplyTo ? [`In-Reply-To: ${options.inReplyTo}`] : []),
      ...(options.references ? [`References: ${options.references}`] : []),
    ].join('\r\n');
    const raw = Buffer.from(`${headers}\r\n\r\n${options.body}`).toString('base64url');
    const res = await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
    return { ok: true, messageId: res.data.id ?? 'unknown' };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function sendZohoReply(options: ZohoSendOptions): Promise<ZohoSendResult> {
  const user = process.env.ZOHO_EMAIL_USER ?? process.env.ZOHO_IMAP_USERNAME ?? '';
  const pass = process.env.ZOHO_EMAIL_PASS ?? process.env.ZOHO_IMAP_PASSWORD ?? process.env.ZOHO_APP_PASSWORD ?? '';
  if (!user || !pass) return { ok: false, error: 'Zoho SMTP credentials not configured. Set ZOHO_EMAIL_USER and ZOHO_EMAIL_PASS (or ZOHO_IMAP_USERNAME / ZOHO_IMAP_PASSWORD).' };
  const transporter = nodemailer.createTransport({ host: process.env.ZOHO_SMTP_HOST || 'smtp.zoho.com', port: Number(process.env.ZOHO_SMTP_PORT || 587), secure: false, auth: { user, pass } });
  try {
    const info = await transporter.sendMail({ from: options.from ?? `Adrian Cole <${user}>`, to: options.to, subject: options.subject.startsWith('Re:') ? options.subject : `Re: ${options.subject}`, text: options.body, ...(options.inReplyTo ? { inReplyTo: options.inReplyTo } : {}), ...(options.references ? { references: options.references } : {}) });
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
