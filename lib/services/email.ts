type EmailProvider = 'gmail' | 'zoho' | 'outlook' | 'none';

export type EmailSummary = {
  provider: EmailProvider;
  inboxes: string[];
  connected: boolean;
  unreadCount: number;
  needsReplyCount: number;
  urgentCount: number;
  note: string;
};

function parseInboxes(raw: string | undefined) {
  if (!raw) return [];
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
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

  return {
    provider,
    inboxes,
    connected,
    unreadCount: 0,
    needsReplyCount: 0,
    urgentCount: 0,
    note: connected
      ? 'Mailbox connector credentials are present. Live thread sync is next.'
      : provider === 'gmail'
        ? 'Email connector not fully configured yet. Add Gmail OAuth env vars to enable sync.'
        : 'Email connector not fully configured yet. Add provider credentials to enable sync.',
  };
}
