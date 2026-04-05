import { Card, CardSubtitle, CardTitle } from '@/components/ui/card';
import { getEmailSummary } from '@/lib/services/email';

export const dynamic = 'force-dynamic';

export default async function EmailPage() {
  const email = await getEmailSummary();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Email</h1>
        <p className="text-sm text-slate-500">Unified inbox snapshot and reply workload.</p>
      </div>

      <Card>
        <CardTitle>{email.provider.toUpperCase()} Inbox</CardTitle>
        <CardSubtitle>{email.note}</CardSubtitle>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-[var(--input-background)] p-3">
            <p className="text-xs text-slate-500">Unread</p>
            <p className="text-xl font-semibold text-slate-900">{email.unreadCount}</p>
          </div>
          <div className="rounded-lg border border-border bg-[var(--input-background)] p-3">
            <p className="text-xs text-slate-500">Need Reply</p>
            <p className="text-xl font-semibold text-slate-900">{email.needsReplyCount}</p>
          </div>
          <div className="rounded-lg border border-border bg-[var(--input-background)] p-3">
            <p className="text-xs text-slate-500">Urgent</p>
            <p className="text-xl font-semibold text-slate-900">{email.urgentCount}</p>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <p className="text-xs text-slate-500">Inboxes: {email.inboxes.join(', ') || 'Primary inbox'}</p>
          {email.previews.slice(0, 10).map((preview) => (
            <div key={preview.id} className="rounded-lg border border-border bg-[var(--input-background)] p-2">
              <p className="truncate text-sm font-semibold text-slate-900">{preview.subject}</p>
              <p className="truncate text-xs text-slate-500">{preview.from}</p>
            </div>
          ))}
          {email.previews.length === 0 && <p className="text-sm text-slate-500">No recent previews available.</p>}
        </div>
      </Card>
    </div>
  );
}
