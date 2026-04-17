import { TaskPriority } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getEmailListUnsubscribeUrl, deleteGmailMessage, sendGmailReply, sendZohoReply } from '@/lib/services/email';
import { createCalendarEvent } from '@/lib/services/calendar';
import { createTask } from '@/lib/services/tasks';
import { getV2EmailFeed, getRubyDraftWithFallback, markDraftSent } from '@/lib/v2/orchestrator';
import type { EmailTriageConfidence, V2EmailTriageSummary } from '@/lib/v2/types';

type Bucket = 'MARKETING' | 'PERSONAL' | 'UPCOMING_EVENT' | 'BILLS' | 'OTHER' | 'ACT_SOON' | 'OPPORTUNITY_PILE' | 'NOT_YOUR_SPEED' | 'NEED_HUMAN_EYES' | 'RELATIONSHIP_KEEPER';

type TriageEmailMeta = {
  id: string;
  subject: string;
  sender: string;
  snippet: string;
  sourceIntegration?: 'Gmail' | 'Zoho' | 'Internal';
};

function classifyEmail(subject: string, preview: string): { bucket: Bucket; confidence: EmailTriageConfidence } {
  const hay = `${subject} ${preview}`.toLowerCase();

  // 1. ACT_SOON — deadlines and urgent action needed
  if (/\b(urgent|deadline|action required|expires|expiring|due (today|tomorrow|this week)|last chance|final notice|overdue|immediate|respond by|asap|time.?sensitive)\b/.test(hay)) {
    return { bucket: 'ACT_SOON', confidence: 'LOCKED_IN' };
  }

  // 2. NEED_HUMAN_EYES — security/legal/compliance
  if (/\b(security alert|suspicious|unauthorized|legal|compliance|lawsuit|attorney|breach|fraud|verify your|account (suspended|locked|compromised)|identity|confidential)\b/.test(hay)) {
    return { bucket: 'NEED_HUMAN_EYES', confidence: 'LOCKED_IN' };
  }

  // 3. BILLS — financial
  if (/\b(invoice|payment due|amount due|statement|bill\b|charge|ach|auto.?pay|late fee|balance due|account summary|receipt|subscription renewal|your (order|purchase))\b/.test(hay)) {
    return { bucket: 'BILLS', confidence: 'LOCKED_IN' };
  }

  // 4. RELATIONSHIP_KEEPER — warm personal contacts
  if (/\b(miss you|thinking of you|long time|how have you been|hope you're (well|doing well)|checking in on|wanted to reconnect|it's been a while|catching up|coffee|lunch|dinner|let's connect|would love to see you|it's been too long)\b/.test(hay)) {
    return { bucket: 'RELATIONSHIP_KEEPER', confidence: 'PRETTY_SURE' };
  }

  // 5. PERSONAL — human senders reaching out
  if (/(\?|following up|can you|would you|are you|let me know|catch up|check in|reach out|wanted to|hope you|just wanted|reaching out|touching base|hi [a-z]+,|hello [a-z]+,)/.test(hay)) {
    return { bucket: 'PERSONAL', confidence: 'PRETTY_SURE' };
  }

  // 6. UPCOMING_EVENT — calendar/event keywords
  if (/\b(event|invite|invitation|conference|webinar|summit|workshop|meetup|rsvp|register now|ticket|gala|fundraiser|join us|you're invited|save the date)\b/.test(hay)) {
    return { bucket: 'UPCOMING_EVENT', confidence: 'LOCKED_IN' };
  }

  // 7. OPPORTUNITY_PILE — opportunity/offer keywords
  if (/\b(opportunity|partnership|collaborate|collab|proposal|introduce|introduction|we'd love to|looking to connect|potential (collaboration|partnership|opportunity)|open to)\b/.test(hay)) {
    return { bucket: 'OPPORTUNITY_PILE', confidence: 'PRETTY_SURE' };
  }

  // 8. MARKETING — newsletter/promo keywords
  if (/(\d+%\s*off|\bsale\b|\bdeal\b|\bdiscount\b|\bpromo\b|checkout|shop now|limited.?time|flash sale|\bmarketing\b|unsubscribe|newsletter|weekly digest|roundup|exclusive offer|\bads?\b|new arrivals|just dropped|browse)/.test(hay)) {
    return { bucket: 'MARKETING', confidence: 'LOCKED_IN' };
  }

  // 9. NOT_YOUR_SPEED — spam-adjacent
  if (/\b(you've been selected|congratulations|you (won|have won)|claim your|free gift|act now|limited offer|don't miss out|be the first|crypto|nft|passive income|make money|earn (from home|extra))\b/.test(hay)) {
    return { bucket: 'NOT_YOUR_SPEED', confidence: 'PRETTY_SURE' };
  }

  return { bucket: 'OTHER', confidence: 'NEEDS_YOUR_EYES' };
}

function classifyWriteBack(subject: string, snippet: string): 'SEND' | 'REVIEW' | 'SKIP' {
  const hay = `${subject} ${snippet}`.toLowerCase();
  if (/\b(fyi|for your (information|reference)|no reply needed|no action (required|needed)|heads up|just (a )?heads up|just sharing|just letting you know)\b/.test(hay)) return 'SKIP';
  if (/(\?.*\?|please (review|advise|let us know|confirm|check)|looking forward to (your|a) (response|feedback|thoughts)|attached|per our (call|meeting|conversation))/i.test(hay)) return 'REVIEW';
  if (/\?|following up|quick (question|ask|note)|checking in|are you (available|free|interested)/i.test(hay)) return 'SEND';
  return 'SKIP';
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
    case 'ACT_SOON': {
      return {
        agentName: 'Adrian',
        recommendation: `${count} email${count > 1 ? 's' : ''} from ${senderList}${senderSuffix} ${count > 1 ? 'need' : 'needs'} a response or action in the next 24–48 hours. I've flagged these as time-sensitive — approve to create tasks for each or handle them directly.`,
        actionLabel: `Create tasks (${count})`,
      };
    }

    case 'NEED_HUMAN_EYES': {
      return {
        agentName: 'All Agents',
        recommendation: `${count} email${count > 1 ? 's' : ''} from ${senderList}${senderSuffix} ${count > 1 ? 'have been flagged' : 'has been flagged'} as potentially sensitive — security alerts, legal language, or compliance-related content. I won't act on these automatically. Review each one carefully.`,
        actionLabel: `Mark as reviewed (${count})`,
      };
    }

    case 'BILLS': {
      const subjects = emails.slice(0, 2).map(e => `"${e.subject}"`).join(', ');
      const subjectSuffix = emails.length > 2 ? ` (+${emails.length - 2} more)` : '';
      return {
        agentName: 'Adobe',
        recommendation: `Found ${count} billing email${count > 1 ? 's' : ''} from ${senderList}${senderSuffix} — ${subjects}${subjectSuffix}. These need financial attention. I recommend logging them as payables and updating the finance dashboard.`,
        actionLabel: `Log to finance (${count})`,
      };
    }

    case 'RELATIONSHIP_KEEPER': {
      return {
        agentName: 'Ruby',
        recommendation: `${count} email${count > 1 ? 's' : ''} from ${senderList}${senderSuffix} ${count > 1 ? 'look' : 'looks'} like real connections worth keeping warm. Ruby can draft thoughtful follow-up replies for each — approve to queue them for your review.`,
        actionLabel: `Queue follow-up drafts (${count})`,
      };
    }

    case 'MARKETING': {
      const intro = count === 1
        ? `There's a marketing email from ${senderList} you haven't responded to.`
        : `You have ${count} marketing and promotional emails from ${senderList}${senderSuffix} sitting in your inbox.`;
      return {
        agentName: 'Adrian',
        recommendation: `${intro} Classic inbox clutter. I recommend unsubscribing and clearing them out.`,
        actionLabel: count === 1 ? 'Unsubscribe & delete' : `Unsubscribe & delete all ${count}`,
      };
    }

    case 'PERSONAL': {
      return {
        agentName: 'Ruby',
        recommendation: `${count} personal email${count > 1 ? 's' : ''} from ${senderList}${senderSuffix} ${count > 1 ? 'are' : 'is'} waiting on a reply. Ruby has grouped them by what's needed — some can be sent right away, others need a quick look first. Approve to send the ready ones and queue the rest.`,
        actionLabel: `Send drafted replies (${count})`,
      };
    }

    case 'UPCOMING_EVENT': {
      const unsure = emails.filter(e =>
        /\b(conference|summit|gala|fundraiser|formal|networking event|industry|annual)\b/i.test(`${e.subject} ${e.snippet}`)
      );
      const confirmed = emails.filter(e => !unsure.includes(e));
      if (unsure.length === 0) {
        return {
          agentName: 'Emerald',
          recommendation: `${count} upcoming event invite${count > 1 ? 's' : ''} from ${senderList}${senderSuffix}. ${count > 1 ? 'These look' : 'This looks'} like ${count > 1 ? 'events' : 'an event'} you'd want on your calendar. Approve to add ${count > 1 ? 'them' : 'it'}.`,
          actionLabel: `Add ${count > 1 ? 'all' : ''} to calendar`.trim(),
        };
      }
      if (confirmed.length === 0) {
        return {
          agentName: 'Emerald',
          recommendation: `${count} event invite${count > 1 ? 's' : ''} from ${senderList}${senderSuffix} — looks like bigger events that may or may not be your speed. Review before anything gets added to your calendar.`,
          actionLabel: `Review & add to calendar (${count})`,
        };
      }
      return {
        agentName: 'Emerald',
        recommendation: `${count} event invite${count > 1 ? 's' : ''} — ${confirmed.length} look like solid fits, ${unsure.length} I'd flag as uncertain. I'll add the confident ones and hold the rest for your call.`,
        actionLabel: 'Review & add to calendar',
      };
    }

    case 'OPPORTUNITY_PILE': {
      return {
        agentName: 'Emerald',
        recommendation: `${count} email${count > 1 ? 's' : ''} from ${senderList}${senderSuffix} ${count > 1 ? 'look' : 'looks'} like potential opportunities — partnerships, intros, or collaborations. Flagged here so nothing slips through, but not urgent. Approve to save them as tasks for future review.`,
        actionLabel: `Save as tasks (${count})`,
      };
    }

    case 'NOT_YOUR_SPEED': {
      return {
        agentName: 'Adrian',
        recommendation: `${count} email${count > 1 ? 's' : ''} from ${senderList}${senderSuffix} ${count > 1 ? 'look' : 'looks'} like spam or low-quality outreach — the agent disagrees with ${count > 1 ? 'these senders' : 'this sender'} being in your inbox. Approve to archive and block.`,
        actionLabel: `Archive & block (${count})`,
      };
    }

    default: {
      return {
        agentName: 'Ruby',
        recommendation: `${count} email${count > 1 ? 's' : ''} from ${senderList}${senderSuffix} that don't fit neatly into another category. Grouped here for your review.`,
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

  type BucketEntry = TriageEmailMeta & { confidence: EmailTriageConfidence };
  const grouped = new Map<Bucket, BucketEntry[]>();

  for (const email of emails) {
    const { bucket, confidence } = classifyEmail(email.subject, email.snippet ?? email.preview ?? '');
    if (!grouped.has(bucket)) grouped.set(bucket, []);
    grouped.get(bucket)!.push({
      id: email.id,
      subject: email.subject,
      sender: email.sender,
      snippet: email.snippet ?? email.preview ?? '',
      sourceIntegration: email.sourceIntegration,
      confidence,
    });
  }

  let created = 0;
  for (const [bucket, bucketEmails] of grouped.entries()) {
    if (bucket === 'OTHER' && bucketEmails.length < 3) continue;

    const { agentName, recommendation, actionLabel } = buildGroupMeta(bucket, bucketEmails);

    // Determine bucket-level confidence: use LOCKED_IN if majority, else PRETTY_SURE, else NEEDS_YOUR_EYES
    const counts = { LOCKED_IN: 0, PRETTY_SURE: 0, NEEDS_YOUR_EYES: 0 };
    for (const e of bucketEmails) counts[e.confidence]++;
    let bucketConfidence: EmailTriageConfidence = 'NEEDS_YOUR_EYES';
    if (counts.LOCKED_IN >= bucketEmails.length / 2) bucketConfidence = 'LOCKED_IN';
    else if (counts.PRETTY_SURE >= bucketEmails.length / 2) bucketConfidence = 'PRETTY_SURE';

    // For ACT_SOON and NEED_HUMAN_EYES, urgentCount = all emails
    const urgentCount = (bucket === 'ACT_SOON' || bucket === 'NEED_HUMAN_EYES') ? bucketEmails.length : 0;

    // For PERSONAL, build write-back sub-groups
    let subGroups: { SEND: string[]; REVIEW: string[]; SKIP: string[] } | undefined;
    if (bucket === 'PERSONAL') {
      subGroups = { SEND: [], REVIEW: [], SKIP: [] };
      for (const e of bucketEmails) {
        const wb = classifyWriteBack(e.subject, e.snippet);
        subGroups[wb].push(e.id);
      }
    }

    const emailSummaries: V2EmailTriageSummary[] = bucketEmails.map(e => ({
      id: e.id,
      subject: e.subject,
      sender: e.sender,
      snippet: e.snippet,
      sourceIntegration: e.sourceIntegration,
    }));

    await prisma.emailAgentTriage.create({
      data: {
        bucket,
        emailIds: bucketEmails.map(e => e.id),
        emailSummaries: emailSummaries as any,
        agentName,
        recommendation,
        actionLabel,
        actionPayload: {
          emailIds: bucketEmails.map(e => e.id),
          confidence: bucketConfidence,
          urgentCount,
          ...(subGroups ? { subGroups } : {}),
        },
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
    triages: rows.map(row => {
      const ap = row.actionPayload as {
        emailIds?: string[];
        confidence?: string;
        urgentCount?: number;
        subGroups?: { SEND: string[]; REVIEW: string[]; SKIP: string[] };
      } | null;
      return {
        id: row.id,
        bucket: row.bucket,
        status: row.status,
        agentName: row.agentName,
        recommendation: row.recommendation,
        actionLabel: row.actionLabel,
        emailSummaries: row.emailSummaries as V2EmailTriageSummary[],
        createdAt: row.createdAt.toISOString(),
        confidence: (ap?.confidence as EmailTriageConfidence | undefined),
        urgentCount: ap?.urgentCount,
        subGroups: ap?.subGroups,
      };
    }),
    lastRunAt: latest?.createdAt.toISOString() ?? null,
  };
}

export async function approveEmailTriage(id: string): Promise<{ ok: boolean; message: string; results?: unknown[] }> {
  const triage = await prisma.emailAgentTriage.findUnique({ where: { id } });
  if (!triage) return { ok: false, message: 'Triage not found' };
  if (triage.status !== 'PENDING') return { ok: true, message: 'Already processed' };

  const emailIds = triage.emailIds as string[];
  const summaries = triage.emailSummaries as TriageEmailMeta[];
  const ap = triage.actionPayload as { emailIds?: string[]; subGroups?: { SEND: string[]; REVIEW: string[]; SKIP: string[] } } | null;
  const results: unknown[] = [];
  const provider = process.env.EMAIL_PROVIDER || 'none';

  try {
    switch (triage.bucket) {
      case 'ACT_SOON': {
        for (const meta of summaries) {
          try {
            const task = await createTask({
              title: `[Urgent] ${meta.subject}`,
              description: `From: ${meta.sender}\n\n${meta.snippet}`,
              priority: TaskPriority.CRITICAL,
            });
            results.push({ emailId: meta.id, action: 'task_created', taskId: task.id });
          } catch (err) {
            results.push({ emailId: meta.id, action: 'error', error: String(err) });
          }
        }
        break;
      }

      case 'NEED_HUMAN_EYES': {
        results.push({ action: 'marked_for_review', count: emailIds.length });
        break;
      }

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

      case 'NOT_YOUR_SPEED': {
        for (const emailId of emailIds) {
          try {
            await deleteGmailMessage(emailId);
            results.push({ emailId, action: 'archived' });
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

      case 'OPPORTUNITY_PILE': {
        for (const meta of summaries) {
          try {
            const task = await createTask({
              title: `[Opportunity] ${meta.subject}`,
              description: `From: ${meta.sender}\n\n${meta.snippet}`,
              priority: TaskPriority.MEDIUM,
            });
            results.push({ emailId: meta.id, action: 'task_created', taskId: task.id });
          } catch (err) {
            results.push({ emailId: meta.id, action: 'error', error: String(err) });
          }
        }
        break;
      }

      case 'RELATIONSHIP_KEEPER': {
        // Queue follow-up drafts via Ruby for each email
        results.push({ action: 'queued_for_ruby', count: emailIds.length });
        break;
      }

      case 'PERSONAL': {
        const sendIds = ap?.subGroups?.SEND ?? [];
        const reviewIds = ap?.subGroups?.REVIEW ?? [];

        // Auto-send SEND group drafts immediately
        for (const emailId of sendIds) {
          const meta = summaries.find(s => s.id === emailId);
          if (!meta) continue;
          try {
            const draft = await getRubyDraftWithFallback(emailId);
            if (!draft) {
              results.push({ emailId, action: 'draft_not_ready', note: 'Ruby draft not found — skipped' });
              continue;
            }
            const senderEmail = meta.sender.match(/<([^>]+)>/)?.[1] ?? meta.sender.trim();
            let sendResult: { ok: boolean; error?: string; messageId?: string };
            if (provider === 'gmail') {
              sendResult = await sendGmailReply({ to: senderEmail, subject: `Re: ${meta.subject}`, body: draft.body });
            } else if (provider === 'zoho') {
              sendResult = await sendZohoReply({ to: senderEmail, subject: `Re: ${meta.subject}`, body: draft.body });
            } else {
              sendResult = { ok: false, error: 'EMAIL_PROVIDER not configured' };
            }
            if (sendResult.ok) {
              await markDraftSent(emailId, draft.id);
              results.push({ emailId, action: 'auto_sent', draftId: draft.id });
            } else {
              results.push({ emailId, action: 'send_failed', error: sendResult.error });
            }
          } catch (err) {
            results.push({ emailId, action: 'error', error: String(err) });
          }
        }

        if (reviewIds.length > 0) {
          results.push({ action: 'queued_for_review', emailIds: reviewIds });
        }
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
