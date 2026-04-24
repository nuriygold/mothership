import { TaskPriority } from '@/lib/db/prisma-types';
import { prisma } from '@/lib/prisma';
import {
  deleteGmailMessage,
  getEmailListUnsubscribeUrl,
  sendGmailReply,
  sendZohoReply,
} from '@/lib/services/email';
import { createCalendarEvent } from '@/lib/services/calendar';
import { createTask } from '@/lib/services/tasks';
import { getV2EmailFeed, markDraftSent } from '@/lib/v2/orchestrator';
import type { EmailTriageBucket, EmailTriageConfidence } from '@/lib/v2/types';

type TriageEmailMeta = {
  id: string;
  subject: string;
  sender: string;
  snippet: string;
  timestamp: string;
  sourceIntegration: 'Gmail' | 'Zoho' | 'Internal';
};

type WriteBackBucket = 'SEND' | 'REVIEW' | 'SKIP';

const KEYWORDS = {
  urgentStrong: ['urgent', 'asap', 'deadline', 'final notice', 'respond by', 'past due', 'expires today'],
  urgentWeak: ['soon', 'quick', 'reminder', 'follow up', 'action needed'],
  sensitiveStrong: ['legal', 'lawsuit', 'compliance', 'security alert', 'fraud', 'breach'],
  sensitiveWeak: ['policy', 'contract', 'review requested', 'privacy'],
  billsStrong: ['invoice', 'payment due', 'amount due', 'statement', 'balance due', 'late fee'],
  billsWeak: ['bill', 'charge', 'autopay', 'receipt'],
  relationshipStrong: ['mom', 'dad', 'sister', 'brother', 'friend', 'family'],
  personalStrong: ['can you', 'would you', 'let me know', 'following up', 'quick question'],
  eventStrong: ['invitation', 'invite', 'conference', 'webinar', 'meetup', 'register'],
  eventWeak: ['calendar', 'event', 'ticket', 'rsvp'],
  opportunityStrong: ['opportunity', 'partnership', 'proposal', 'collaboration'],
  opportunityWeak: ['offer', 'intro', 'new role', 'potential'],
  marketingStrong: ['newsletter', 'sale', 'promo', 'unsubscribe', 'limited time', 'discount'],
  marketingWeak: ['digest', 'roundup', 'latest updates'],
  notYourSpeedStrong: ['casino', 'crypto signal', 'adult', 'lottery', 'work from home'],
  notYourSpeedWeak: ['guaranteed', 'double your', 'click now'],
};

function countHits(hay: string, terms: string[]): number {
  return terms.filter((term) => hay.includes(term)).length;
}

function scoreConfidence(strongHits: number, weakHits: number): EmailTriageConfidence {
  if (strongHits >= 2) return 'LOCKED_IN';
  if (strongHits >= 1 || weakHits >= 2) return 'PRETTY_SURE';
  return 'NEEDS_YOUR_EYES';
}

function classifyEmail(email: TriageEmailMeta): {
  bucket: EmailTriageBucket;
  confidence: EmailTriageConfidence;
  urgent: boolean;
} {
  const hay = `${email.subject} ${email.sender} ${email.snippet}`.toLowerCase();
  const ageMs = Date.now() - new Date(email.timestamp).getTime();
  const isRecent = ageMs <= 1000 * 60 * 60 * 48;

  const urgentStrong = countHits(hay, KEYWORDS.urgentStrong);
  const urgentWeak = countHits(hay, KEYWORDS.urgentWeak);
  const sensitiveStrong = countHits(hay, KEYWORDS.sensitiveStrong);
  const sensitiveWeak = countHits(hay, KEYWORDS.sensitiveWeak);
  const billsStrong = countHits(hay, KEYWORDS.billsStrong);
  const billsWeak = countHits(hay, KEYWORDS.billsWeak);
  const relationshipStrong = countHits(hay, KEYWORDS.relationshipStrong);
  const personalStrong = countHits(hay, KEYWORDS.personalStrong);
  const eventStrong = countHits(hay, KEYWORDS.eventStrong);
  const eventWeak = countHits(hay, KEYWORDS.eventWeak);
  const opportunityStrong = countHits(hay, KEYWORDS.opportunityStrong);
  const opportunityWeak = countHits(hay, KEYWORDS.opportunityWeak);
  const marketingStrong = countHits(hay, KEYWORDS.marketingStrong);
  const marketingWeak = countHits(hay, KEYWORDS.marketingWeak);
  const notSpeedStrong = countHits(hay, KEYWORDS.notYourSpeedStrong);
  const notSpeedWeak = countHits(hay, KEYWORDS.notYourSpeedWeak);

  if ((urgentStrong > 0 || urgentWeak >= 2) && isRecent) {
    return {
      bucket: 'ACT_SOON',
      confidence: scoreConfidence(urgentStrong, urgentWeak),
      urgent: true,
    };
  }

  if (sensitiveStrong > 0 || sensitiveWeak >= 2) {
    return {
      bucket: 'NEED_HUMAN_EYES',
      confidence: scoreConfidence(sensitiveStrong, sensitiveWeak),
      urgent: true,
    };
  }

  if (billsStrong > 0 || billsWeak >= 2) {
    return {
      bucket: 'BILLS',
      confidence: scoreConfidence(billsStrong, billsWeak),
      urgent: true,
    };
  }

  if (relationshipStrong > 0) {
    return {
      bucket: 'RELATIONSHIP_KEEPER',
      confidence: scoreConfidence(relationshipStrong, 0),
      urgent: false,
    };
  }

  if (personalStrong > 0 && marketingStrong === 0) {
    return {
      bucket: 'PERSONAL',
      confidence: scoreConfidence(personalStrong, 0),
      urgent: false,
    };
  }

  if (eventStrong > 0 || eventWeak >= 2) {
    return {
      bucket: 'UPCOMING_EVENT',
      confidence: scoreConfidence(eventStrong, eventWeak),
      urgent: false,
    };
  }

  if (opportunityStrong > 0 || opportunityWeak >= 2) {
    return {
      bucket: 'OPPORTUNITY_PILE',
      confidence: scoreConfidence(opportunityStrong, opportunityWeak),
      urgent: false,
    };
  }

  if (marketingStrong > 0 || marketingWeak >= 2) {
    return {
      bucket: 'MARKETING',
      confidence: scoreConfidence(marketingStrong, marketingWeak),
      urgent: false,
    };
  }

  if (notSpeedStrong > 0 || notSpeedWeak >= 2) {
    return {
      bucket: 'NOT_YOUR_SPEED',
      confidence: scoreConfidence(notSpeedStrong, notSpeedWeak),
      urgent: false,
    };
  }

  return {
    bucket: 'OTHER',
    confidence: 'NEEDS_YOUR_EYES',
    urgent: false,
  };
}

function senderFirstName(sender: string): string {
  const match = sender.match(/^([^<]+)/);
  const name = match ? match[1].trim().replace(/^"(.*)"$/, '$1') : sender;
  return name.split(/\s+/)[0] || name;
}

function buildGroupMeta(bucket: EmailTriageBucket, emails: TriageEmailMeta[]) {
  const count = emails.length;
  const unique = [...new Set(emails.map((e) => senderFirstName(e.sender)))];
  const senderList = unique.slice(0, 3).join(', ');
  const senderSuffix = unique.length > 3 ? ` and ${unique.length - 3} more` : '';

  switch (bucket) {
    case 'ACT_SOON':
      return {
        agentName: 'Adrian',
        recommendation: `These ${count} threads need near-term action from ${senderList}${senderSuffix}.`,
        actionLabel: 'Create action tasks',
      };
    case 'NEED_HUMAN_EYES':
      return {
        agentName: 'All',
        recommendation: `${count} threads look sensitive and are flagged for manual review.`,
        actionLabel: 'Mark for review',
      };
    case 'BILLS':
      return {
        agentName: 'Adobe',
        recommendation: `${count} finance threads from ${senderList}${senderSuffix} were grouped as payables.`,
        actionLabel: 'Queue payables',
      };
    case 'RELATIONSHIP_KEEPER':
      return {
        agentName: 'Ruby',
        recommendation: `${count} relationship emails deserve a warm follow-up touchpoint.`,
        actionLabel: 'Queue follow-up drafts',
      };
    case 'PERSONAL':
      return {
        agentName: 'Ruby',
        recommendation: `${count} personal emails are grouped for write-back review and approval.`,
        actionLabel: 'Approve SEND group',
      };
    case 'UPCOMING_EVENT':
      return {
        agentName: 'Emerald',
        recommendation: `${count} event-related messages can be converted into calendar entries.`,
        actionLabel: 'Create calendar holds',
      };
    case 'OPPORTUNITY_PILE':
      return {
        agentName: 'Emerald',
        recommendation: `${count} possible opportunities were collected for a later pass.`,
        actionLabel: 'Archive safely',
      };
    case 'MARKETING':
      return {
        agentName: 'Adrian',
        recommendation: `${count} marketing emails are ready for bulk cleanup.`,
        actionLabel: 'Archive marketing',
      };
    case 'NOT_YOUR_SPEED':
      return {
        agentName: 'Adrian',
        recommendation: `${count} low-value threads are likely not useful to keep in inbox.`,
        actionLabel: 'Archive low-value',
      };
    default:
      return {
        agentName: 'Ruby',
        recommendation: `${count} threads were kept in a neutral bucket for your review.`,
        actionLabel: 'Archive',
      };
  }
}

async function classifyWriteBack(emailId: string, snippet: string): Promise<WriteBackBucket> {
  const draft = await prisma.emailDraftSuggestion.findFirst({
    where: { emailExternalId: emailId, source: 'ruby_custom', approvedAt: null },
    orderBy: { createdAt: 'desc' },
  });

  if (!draft) return 'SKIP';

  const hay = `${draft.body} ${snippet}`.toLowerCase();
  if (/\b(ready to send|sounds great|let's do it|confirm|yes)\b/.test(hay)) return 'SEND';
  if (/\b(not sure|question|clarify|maybe)\b/.test(hay)) return 'REVIEW';
  return draft.body.length > 140 ? 'SEND' : 'REVIEW';
}

export async function runEmailAgentTriage(): Promise<{ created: number; dismissed: number }> {
  const dismissed = await prisma.emailAgentTriage.updateMany({
    where: { status: 'PENDING' },
    data: { status: 'DENIED', deniedAt: new Date() },
  });

  const feed = await getV2EmailFeed();
  const emails = feed.inbox;
  if (emails.length === 0) return { created: 0, dismissed: dismissed.count };

  const grouped = new Map<EmailTriageBucket, TriageEmailMeta[]>();
  const urgency = new Map<EmailTriageBucket, number>();
  const confidences = new Map<EmailTriageBucket, EmailTriageConfidence[]>();
  const personalSubGroups = { SEND: [] as string[], REVIEW: [] as string[], SKIP: [] as string[] };

  for (const email of emails) {
    const meta: TriageEmailMeta = {
      id: email.id,
      subject: email.subject,
      sender: email.sender,
      snippet: email.snippet ?? email.preview ?? '',
      timestamp: email.timestamp,
      sourceIntegration: email.sourceIntegration,
    };
    const { bucket, confidence, urgent } = classifyEmail(meta);

    if (!grouped.has(bucket)) grouped.set(bucket, []);
    grouped.get(bucket)!.push(meta);
    if (urgent || bucket === 'BILLS') urgency.set(bucket, (urgency.get(bucket) ?? 0) + 1);
    if (!confidences.has(bucket)) confidences.set(bucket, []);
    confidences.get(bucket)!.push(confidence);

    if (bucket === 'PERSONAL') {
      const wb = await classifyWriteBack(meta.id, meta.snippet);
      personalSubGroups[wb].push(meta.id);
    }
  }

  let created = 0;
  for (const [bucket, bucketEmails] of grouped.entries()) {
    if (bucketEmails.length === 0) continue;
    const { agentName, recommendation, actionLabel } = buildGroupMeta(bucket, bucketEmails);
    const bucketConfidences = confidences.get(bucket) ?? [];
    const payload = {
      emailIds: bucketEmails.map((e) => e.id),
      urgentCount: urgency.get(bucket) ?? 0,
      confidence: bucketConfidences.includes('LOCKED_IN')
        ? 'LOCKED_IN'
        : bucketConfidences.includes('PRETTY_SURE')
          ? 'PRETTY_SURE'
          : 'NEEDS_YOUR_EYES',
      subGroups: bucket === 'PERSONAL' ? personalSubGroups : undefined,
    };

    await prisma.emailAgentTriage.create({
      data: {
        bucket,
        emailIds: bucketEmails.map((e) => e.id),
        emailSummaries: bucketEmails as unknown as object,
        agentName,
        recommendation,
        actionLabel,
        actionPayload: payload as unknown as object,
      },
    });
    created += 1;
  }

  return { created, dismissed: dismissed.count };
}

export async function listPendingTriages() {
  const [rows, latest] = await Promise.all([
    prisma.emailAgentTriage.findMany({ where: { status: 'PENDING' }, orderBy: { createdAt: 'desc' } }),
    prisma.emailAgentTriage.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
  ]);

  return {
    triages: rows.map((row) => {
      const payload = (row.actionPayload as Record<string, unknown> | null) ?? {};
      return {
        ...row,
        emailIds: row.emailIds as string[],
        emailSummaries: row.emailSummaries as TriageEmailMeta[],
        actionPayload: payload,
        urgentCount: (payload.urgentCount as number | undefined) ?? 0,
        confidence: (payload.confidence as EmailTriageConfidence | undefined) ?? 'NEEDS_YOUR_EYES',
        subGroups: (payload.subGroups as { SEND: string[]; REVIEW: string[]; SKIP: string[] } | undefined) ?? undefined,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        approvedAt: row.approvedAt?.toISOString() ?? null,
        deniedAt: row.deniedAt?.toISOString() ?? null,
        executedAt: row.executedAt?.toISOString() ?? null,
      };
    }),
    lastRunAt: latest?.createdAt.toISOString() ?? null,
  };
}

async function archiveEmails(emailIds: string[]) {
  const results: unknown[] = [];
  for (const emailId of emailIds) {
    try {
      const url = await getEmailListUnsubscribeUrl(emailId);
      if (url) await fetch(url, { method: 'GET', redirect: 'follow' });
      await deleteGmailMessage(emailId);
      results.push({ emailId, action: 'archived' });
    } catch (err) {
      results.push({ emailId, action: 'error', error: String(err) });
    }
  }
  return results;
}

export async function approveEmailTriage(id: string): Promise<{ ok: boolean; message: string; results?: unknown[] }> {
  const triage = await prisma.emailAgentTriage.findUnique({ where: { id } });
  if (!triage) return { ok: false, message: 'Triage not found' };
  if (triage.status !== 'PENDING') return { ok: true, message: 'Already processed' };

  const emailIds = triage.emailIds as string[];
  const summaries = triage.emailSummaries as TriageEmailMeta[];
  const payload = (triage.actionPayload as { subGroups?: { SEND: string[]; REVIEW: string[]; SKIP: string[] } } | null) ?? null;
  const results: unknown[] = [];

  try {
    switch (triage.bucket) {
      case 'PERSONAL': {
        const sendIds = payload?.subGroups?.SEND ?? emailIds;
        const feed = await getV2EmailFeed();
        const byId = new Map(feed.inbox.map((mail) => [mail.id, mail]));

        for (const emailId of sendIds) {
          try {
            const draft = await prisma.emailDraftSuggestion.findFirst({
              where: { emailExternalId: emailId, source: 'ruby_custom', approvedAt: null },
              orderBy: { createdAt: 'desc' },
            });
            const email = byId.get(emailId);
            if (!draft || !email) {
              results.push({ emailId, action: 'skipped_no_draft_or_email' });
              continue;
            }
            const to = email.sender.match(/<([^>]+)>/)?.[1] ?? email.sender;
            if (email.sourceIntegration === 'Zoho') {
              await sendZohoReply({ to, subject: email.subject, body: draft.body });
            } else {
              await sendGmailReply({ to, subject: email.subject, body: draft.body });
            }
            await markDraftSent(emailId, draft.id);
            results.push({ emailId, action: 'sent' });
          } catch (err) {
            results.push({ emailId, action: 'error', error: String(err) });
          }
        }
        break;
      }
      case 'ACT_SOON': {
        for (const meta of summaries) {
          const task = await createTask({
            title: `[Act Soon] ${meta.subject}`,
            description: `From: ${meta.sender}\n\n${meta.snippet}`,
            priority: TaskPriority.HIGH,
          });
          results.push({ emailId: meta.id, action: 'task_created', taskId: task.id });
        }
        break;
      }
      case 'BILLS': {
        for (const meta of summaries) {
          const task = await createTask({
            title: `[Payable] ${meta.subject}`,
            description: `From: ${meta.sender}\n\n${meta.snippet}`,
            priority: TaskPriority.HIGH,
          });
          results.push({ emailId: meta.id, action: 'payable_task_created', taskId: task.id });
        }
        break;
      }
      case 'UPCOMING_EVENT': {
        for (const meta of summaries) {
          const when = new Date();
          when.setDate(when.getDate() + 1);
          when.setHours(10, 0, 0, 0);
          const event = await createCalendarEvent({
            title: meta.subject,
            description: `From: ${meta.sender}\n\n${meta.snippet}`,
            startDateTime: when.toISOString(),
          });
          results.push({ emailId: meta.id, action: 'calendar_event_created', eventId: event.id });
        }
        break;
      }
      case 'RELATIONSHIP_KEEPER': {
        for (const meta of summaries) {
          const task = await createTask({
            title: `[Relationship] Follow up: ${meta.subject}`,
            description: `Warm follow-up requested.\nFrom: ${meta.sender}\n\n${meta.snippet}`,
            priority: TaskPriority.MEDIUM,
          });
          results.push({ emailId: meta.id, action: 'follow_up_queued', taskId: task.id });
        }
        break;
      }
      case 'NEED_HUMAN_EYES': {
        for (const meta of summaries) {
          const task = await createTask({
            title: `[Manual Review] ${meta.subject}`,
            description: `Needs human review.\nFrom: ${meta.sender}\n\n${meta.snippet}`,
            priority: TaskPriority.CRITICAL,
          });
          results.push({ emailId: meta.id, action: 'human_review_task_created', taskId: task.id });
        }
        break;
      }
      case 'MARKETING':
      case 'NOT_YOUR_SPEED':
      case 'OPPORTUNITY_PILE':
      case 'OTHER': {
        results.push(...(await archiveEmails(emailIds)));
        break;
      }
      default:
        break;
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
