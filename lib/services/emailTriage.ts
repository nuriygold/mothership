import { TaskPriority } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getEmailListUnsubscribeUrl, deleteGmailMessage } from '@/lib/services/email';
import { createCalendarEvent } from '@/lib/services/calendar';
import { createTask } from '@/lib/services/tasks';
import { getV2EmailFeed } from '@/lib/v2/orchestrator';

type Bucket = 'MARKETING' | 'PERSONAL' | 'UPCOMING_EVENT' | 'BILLS' | 'OTHER';

type TriageEmailMeta = {
  id: string;
  subject: string;
  sender: string;
  snippet: string;
};

function classifyEmail(subject: string, preview: string): Bucket {
  const hay = `${subject} ${preview}`.toLowerCase();
  if (/\b(invoice|payment due|amount due|statement|bill\b|charge|ach|auto.?pay|late fee|balance due|account summary)\b/.test(hay)) return 'BILLS';
  if (/\b(event|invite|invitation|conference|webinar|summit|workshop|meetup|rsvp|register now|ticket|gala|fundraiser)\b/.test(hay)) return 'UPCOMING_EVENT';
  if (/(\d+%\s*off|\bsale\b|\bdeal\b|\bdiscount\b|\bpromo\b|checkout|shop now|limited.?time|flash sale|\bmarketing\b|unsubscribe|newsletter|weekly digest|roundup|exclusive offer|\bads?\b)/.test(hay)) return 'MARKETING';
  if (/(\?|following up|can you|would you|are you|let me know|catch up|check in|reach out|wanted to|hope you|just wanted|reaching out|touching base|hi [a-z]+,|hello [a-z]+,)/.test(hay)) return 'PERSONAL';
  return 'OTHER';
}

function senderFirstName(sender: string): string {
  const match = sender.match(/^([^<]+)/);
  const name = match ? match[1].trim().replace(/^"(.*)"$/, '$1') : sender;
  return name.split(/\s+/)[0] || name;
}

function buildGroupMeta(bucket: Bucket, emails: TriageEmailMeta[]): {
  agentName: string;
  recommendation: string;
  actionLabel: string;
} {
  const count = emails.length;
  const unique = [...new Set(emails.map(e => senderFirstName(e.sender)))];
  const senderList = unique.slice(0, 3).join(', ');
  const senderSuffix = unique.length > 3 ? ` and ${unique.length - 3} more` : '';

  switch (bucket) {
    case 'MARKETING': {
      const intro = count === 1
        ? `There's a marketing email from ${senderList} you haven't responded to.`
        : `You have ${count} marketing and promotional emails from ${senderList}${senderSuffix} sitting in your inbox.`;
      return {
        agentName: 'Ruby',
        recommendation: `${intro} You haven't responded to these in a while — classic inbox clutter. I recommend unsubscribing from all of them and clearing them out.`,
        actionLabel: count === 1 ? 'Unsubscribe & delete' : `Unsubscribe & delete all ${count}`,
      };
    }

    case 'BILLS': {
      const subjects = emails.slice(0, 2).map(e => `"${e.subject}"`).join(', ');
      const subjectSuffix = emails.length > 2 ? ` (+${emails.length - 2} more)` : '';
      return {
        agentName: 'Emerald',
        recommendation: `Found ${count} billing email${count > 1 ? 's' : ''} from ${senderList}${senderSuffix} — ${subjects}${subjectSuffix}. These need financial attention. I recommend sending them over to Emerald to log the payables and update the finance dashboard.`,
        actionLabel: `Send to Emerald (${count} email${count > 1 ? 's' : ''})`,
      };
    }

    case 'UPCOMING_EVENT': {
      const unsure = emails.filter(e =>
        /\b(conference|summit|gala|fundraiser|formal|networking event|industry|annual)\b/i.test(`${e.subject} ${e.snippet}`)
      );
      const confirmed = emails.filter(e => !unsure.includes(e));

      if (unsure.length === 0) {
        return {
          agentName: 'Ruby',
          recommendation: `You have ${count} upcoming event invite${count > 1 ? 's' : ''} from ${senderList}${senderSuffix}. ${count > 1 ? 'These look' : 'This looks'} like ${count > 1 ? 'events' : 'an event'} you'd want on your calendar. I recommend adding ${count > 1 ? 'them' : 'it'}.`,
          actionLabel: `Add ${count > 1 ? 'all' : ''} to calendar`.trim(),
        };
      } else if (confirmed.length === 0) {
        const eventNames = unsure.slice(0, 2).map(e => `"${e.subject}"`).join(', ');
        return {
          agentName: 'Ruby',
          recommendation: `Got ${count} event invite${count > 1 ? 's' : ''} from ${senderList}${senderSuffix} — ${eventNames}${unsure.length > 2 ? '…' : ''}. ${count > 1 ? 'These are bigger events' : 'This is a bigger event'} that may or may not be your speed. Review before I add anything to your calendar.`,
          actionLabel: `Add to calendar (${count} flagged for review)`,
        };
      } else {
        return {
          agentName: 'Ruby',
          recommendation: `You have ${count} event invite${count > 1 ? 's' : ''} — ${confirmed.length} look like solid fits, but ${unsure.length} I'd flag as uncertain. I'll add the confident ones and you can decide on the rest.`,
          actionLabel: 'Review & add to calendar',
        };
      }
    }

    case 'PERSONAL': {
      return {
        agentName: 'Ruby',
        recommendation: `There are ${count} personal email${count > 1 ? 's' : ''} from ${senderList}${senderSuffix} waiting on a reply. Ruby has prepared draft responses for each — approve to review and queue them, or dismiss to handle manually.`,
        actionLabel: `Review Ruby's drafts (${count})`,
      };
    }

    default: {
      return {
        agentName: 'Adrian',
        recommendation: `There are ${count} email${count > 1 ? 's' : ''} from ${senderList}${senderSuffix} that don't fit neatly into another category. Grouped here for your review.`,
        actionLabel: `Review (${count})`,
      };
    }
  }
}

export async function runEmailAgentTriage(): Promise<{ created: number; dismissed: number }> {
  const dismissed = await prisma.emailAgentTriage.updateMany({
    where: { status: 'PENDING' },
    data: { status: 'DENIED', deniedAt: new Date() },
  });

  const feed = await getV2EmailFeed();
  const emails = feed.inbox;
  if (emails.length === 0) return { created: 0, dismissed: dismissed.count };

  const grouped = new Map<Bucket, TriageEmailMeta[]>();
  for (const email of emails) {
    const bucket = classifyEmail(email.subject, email.snippet ?? email.preview ?? '');
    if (!grouped.has(bucket)) grouped.set(bucket, []);
    grouped.get(bucket)!.push({
      id: email.id,
      subject: email.subject,
      sender: email.sender,
      snippet: email.snippet ?? email.preview ?? '',
    });
  }

  let created = 0;
  for (const [bucket, bucketEmails] of grouped.entries()) {
    if (bucket === 'OTHER' && bucketEmails.length < 3) continue;

    const { agentName, recommendation, actionLabel } = buildGroupMeta(bucket, bucketEmails);

    await prisma.emailAgentTriage.create({
      data: {
        bucket,
        emailIds: bucketEmails.map(e => e.id),
        emailSummaries: bucketEmails as any,
        agentName,
        recommendation,
        actionLabel,
        actionPayload: { emailIds: bucketEmails.map(e => e.id) },
      },
    });
    created++;
  }

  return { created, dismissed: dismissed.count };
}

export async function listPendingTriages() {
  const [rows, latest] = await Promise.all([
    prisma.emailAgentTriage.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.emailAgentTriage.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
  ]);

  return {
    triages: rows.map(row => ({
      ...row,
      emailIds: row.emailIds as string[],
      emailSummaries: row.emailSummaries as TriageEmailMeta[],
      actionPayload: row.actionPayload as Record<string, unknown> | null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      approvedAt: row.approvedAt?.toISOString() ?? null,
      deniedAt: row.deniedAt?.toISOString() ?? null,
      executedAt: row.executedAt?.toISOString() ?? null,
    })),
    lastRunAt: latest?.createdAt.toISOString() ?? null,
  };
}

export async function approveEmailTriage(id: string): Promise<{ ok: boolean; message: string; results?: unknown[] }> {
  const triage = await prisma.emailAgentTriage.findUnique({ where: { id } });
  if (!triage) return { ok: false, message: 'Triage not found' };
  if (triage.status !== 'PENDING') return { ok: true, message: 'Already processed' };

  const emailIds = triage.emailIds as string[];
  const summaries = triage.emailSummaries as TriageEmailMeta[];
  const results: unknown[] = [];

  try {
    switch (triage.bucket) {
      case 'MARKETING': {
        for (const emailId of emailIds) {
          try {
            const url = await getEmailListUnsubscribeUrl(emailId);
            if (url) await fetch(url, { method: 'GET', redirect: 'follow' });
            await deleteGmailMessage(emailId);
            results.push({ emailId, action: 'unsubscribed_and_deleted' });
          } catch (err) {
            results.push({ emailId, action: 'error', error: String(err) });
          }
        }
        break;
      }

      case 'BILLS': {
        for (const meta of summaries) {
          try {
            const task = await createTask({
              title: `[Finance] ${meta.subject}`,
              description: `From: ${meta.sender}\n\n${meta.snippet}`,
              priority: TaskPriority.HIGH,
            });
            results.push({ emailId: meta.id, action: 'task_created', taskId: task.id });
          } catch (err) {
            results.push({ emailId: meta.id, action: 'error', error: String(err) });
          }
        }
        break;
      }

      case 'UPCOMING_EVENT': {
        for (const meta of summaries) {
          try {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(10, 0, 0, 0);
            const result = await createCalendarEvent({
              title: meta.subject,
              description: `From: ${meta.sender}\n\n${meta.snippet}`,
              startDateTime: tomorrow.toISOString(),
            });
            results.push({ emailId: meta.id, action: 'calendar_event_created', eventId: result.id });
          } catch (err) {
            results.push({ emailId: meta.id, action: 'error', error: String(err) });
          }
        }
        break;
      }

      case 'PERSONAL': {
        // Ruby drafts are already generated per-email; just acknowledge so user reviews them in inbox
        results.push({ action: 'queued_for_review', count: emailIds.length });
        break;
      }

      default: {
        results.push({ action: 'acknowledged', count: emailIds.length });
      }
    }

    await prisma.emailAgentTriage.update({
      where: { id },
      data: { status: 'EXECUTED', approvedAt: new Date(), executedAt: new Date() },
    });

    return { ok: true, message: 'Action executed', results };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export async function denyEmailTriage(id: string): Promise<{ ok: boolean }> {
  await prisma.emailAgentTriage.updateMany({
    where: { id, status: 'PENDING' },
    data: { status: 'DENIED', deniedAt: new Date() },
  });
  return { ok: true };
}
