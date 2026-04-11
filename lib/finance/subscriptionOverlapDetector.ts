/**
 * Subscription Overlap Detector
 *
 * Scans confirmed subscriptions against known service clusters and surfaces
 * cases where multiple competing services in the same category are active.
 *
 * Examples:
 *   ChatGPT + Claude + Gemini  → AI Assistants overlap, $60/mo
 *   Netflix + Hulu + Max       → Video Streaming overlap, $45/mo
 *   Dropbox + iCloud + OneDrive → Cloud Storage overlap, $18/mo
 *
 * Emits SUBSCRIPTION_OVERLAP (once per cluster, deduplicated).
 * Resolves stale overlap events automatically when the overlap no longer exists.
 */

import { prisma } from '@/lib/prisma';
import { createFinanceEvent, resolveFinanceEvent } from '@/lib/finance/events';

// ─── Service clusters ────────────────────────────────────────────────────────

type ServiceCluster = {
  name: string;
  keywords: string[];  // lowercase — matched against normalized merchant name
};

const SERVICE_CLUSTERS: ServiceCluster[] = [
  {
    name: 'AI Assistants',
    keywords: ['chatgpt', 'openai', 'claude', 'anthropic', 'gemini', 'google one ai', 'copilot', 'perplexity', 'grok', 'midjourney', 'runway'],
  },
  {
    name: 'Video Streaming',
    keywords: ['netflix', 'hulu', 'max', 'hbo', 'disney', 'disneyplus', 'paramount', 'peacock', 'apple tv', 'appletv', 'youtube premium', 'amazon prime video', 'primevideo', 'mubi', 'criterion'],
  },
  {
    name: 'Music Streaming',
    keywords: ['spotify', 'apple music', 'tidal', 'amazon music', 'youtube music', 'deezer', 'pandora', 'soundcloud'],
  },
  {
    name: 'Cloud Storage',
    keywords: ['dropbox', 'google drive', 'google one', 'icloud', 'onedrive', 'box', 'backblaze', 'pcloud'],
  },
  {
    name: 'Project Management',
    keywords: ['notion', 'asana', 'monday', 'linear', 'basecamp', 'trello', 'clickup', 'airtable', 'height'],
  },
  {
    name: 'Password Managers',
    keywords: ['1password', 'lastpass', 'bitwarden', 'dashlane', 'keeper', 'nordpass', 'roboform'],
  },
  {
    name: 'VPN Services',
    keywords: ['nordvpn', 'expressvpn', 'mullvad', 'protonvpn', 'surfshark', 'cyberghost', 'ipvanish', 'tunnelbear'],
  },
  {
    name: 'News & Media',
    keywords: ['new york times', 'nytimes', 'wall street journal', 'wsj', 'washington post', 'wapo', 'the atlantic', 'substack', 'medium', 'economist'],
  },
  {
    name: 'Fitness & Wellness',
    keywords: ['peloton', 'noom', 'headspace', 'calm', 'whoop', 'strava', 'apple fitness', 'gympass', 'classpass'],
  },
  {
    name: 'Design & Creative',
    keywords: ['figma', 'adobe', 'canva', 'sketch', 'framer', 'webflow', 'invision'],
  },
];

// ─── Monthly cost normalization ───────────────────────────────────────────────

const MONTHLY_MULTIPLIER: Record<string, number> = {
  weekly:    4.33,
  biweekly:  2.167,
  monthly:   1,
  quarterly: 1 / 3,
  annual:    1 / 12,
};

function toMonthlyCost(amount: number, interval: string | null): number {
  const mult = MONTHLY_MULTIPLIER[interval ?? 'monthly'] ?? 1;
  return Math.round(amount * mult * 100) / 100;
}

// ─── Matching ─────────────────────────────────────────────────────────────────

function matchesCluster(merchantName: string, cluster: ServiceCluster): boolean {
  const normalized = merchantName.toLowerCase().replace(/[^a-z0-9\s]/g, '');
  return cluster.keywords.some((kw) => normalized.includes(kw));
}

// ─── Deduplication ───────────────────────────────────────────────────────────

async function getOpenOverlapEvent(clusterName: string) {
  return prisma.financeEvent.findFirst({
    where: {
      type: 'SUBSCRIPTION_OVERLAP',
      resolved: false,
    },
  }).then((event) => {
    if (!event) return null;
    // Check payload matches this cluster
    const p = event.payload as Record<string, unknown>;
    return p.clusterName === clusterName ? event : null;
  });
}

// We need to search through all unresolved overlap events for this cluster
async function findOpenOverlapEventForCluster(clusterName: string) {
  const events = await prisma.financeEvent.findMany({
    where: {
      type: 'SUBSCRIPTION_OVERLAP',
      resolved: false,
    },
  });
  return events.find((e) => {
    const p = e.payload as Record<string, unknown>;
    return p.clusterName === clusterName;
  }) ?? null;
}

// ─── Core scan ────────────────────────────────────────────────────────────────

type OverlapResult = {
  clusterName: string;
  services: string[];       // merchant names
  monthlyCost: number;
};

async function detectOverlaps(): Promise<OverlapResult[]> {
  const confirmed = await prisma.merchantProfile.findMany({
    where: {
      isSubscription: true,
      subscriptionConfirmed: true,
    },
    select: { merchantName: true, billingInterval: true },
  });

  // Get amounts from most recent transaction for each
  const withAmounts = await Promise.all(
    confirmed.map(async (sub) => {
      const lastTx = await prisma.transaction.findFirst({
        where: {
          description: { equals: sub.merchantName, mode: 'insensitive' },
          amount: { lt: 0 },
        },
        orderBy: { occurredAt: 'desc' },
        select: { amount: true },
      });
      return {
        merchantName: sub.merchantName,
        billingInterval: sub.billingInterval,
        monthlyAmount: lastTx
          ? toMonthlyCost(Math.abs(lastTx.amount), sub.billingInterval)
          : 0,
      };
    })
  );

  const overlaps: OverlapResult[] = [];

  for (const cluster of SERVICE_CLUSTERS) {
    const matches = withAmounts.filter((sub) =>
      matchesCluster(sub.merchantName, cluster)
    );

    if (matches.length < 2) continue;

    overlaps.push({
      clusterName: cluster.name,
      services: matches.map((m) => m.merchantName),
      monthlyCost: Math.round(
        matches.reduce((s, m) => s + m.monthlyAmount, 0) * 100
      ) / 100,
    });
  }

  return overlaps;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Run the full overlap scan. For each cluster with ≥2 confirmed subscriptions:
 *   - Emits SUBSCRIPTION_OVERLAP if no open event exists yet
 *   - Updates the existing event payload if the services/cost changed
 *
 * For clusters that *no longer* have overlap (user cancelled one):
 *   - Resolves the stale SUBSCRIPTION_OVERLAP event automatically
 *
 * Safe to call fire-and-forget.
 */
export async function scanSubscriptionOverlaps(): Promise<void> {
  try {
    const overlaps = await detectOverlaps();
    const detectedClusters = new Set(overlaps.map((o) => o.clusterName));

    // Emit or update events for detected overlaps
    for (const overlap of overlaps) {
      const existing = await findOpenOverlapEventForCluster(overlap.clusterName);

      if (!existing) {
        await createFinanceEvent('SUBSCRIPTION_OVERLAP', 'subscription-overlap-detector', {
          clusterName: overlap.clusterName,
          services: overlap.services,
          monthlyCost: overlap.monthlyCost,
          priority: 'normal',
        });
        console.log(
          `[overlapDetector:${overlap.clusterName}] new overlap — ${overlap.services.join(', ')} ($${overlap.monthlyCost}/mo)`
        );
      } else {
        // Services or cost changed — update payload in place
        const p = existing.payload as Record<string, unknown>;
        const servicesChanged =
          JSON.stringify(p.services) !== JSON.stringify(overlap.services);
        const costChanged = p.monthlyCost !== overlap.monthlyCost;

        if (servicesChanged || costChanged) {
          await prisma.financeEvent.update({
            where: { id: existing.id },
            data: {
              payload: {
                clusterName: overlap.clusterName,
                services: overlap.services,
                monthlyCost: overlap.monthlyCost,
                priority: 'normal',
              },
            },
          });
          console.log(
            `[overlapDetector:${overlap.clusterName}] updated — ${overlap.services.join(', ')}`
          );
        }
      }
    }

    // Auto-resolve stale events for clusters that no longer overlap
    const allOpenOverlaps = await prisma.financeEvent.findMany({
      where: { type: 'SUBSCRIPTION_OVERLAP', resolved: false },
    });

    for (const event of allOpenOverlaps) {
      const p = event.payload as Record<string, unknown>;
      const clusterName = String(p.clusterName ?? '');
      if (!detectedClusters.has(clusterName)) {
        await resolveFinanceEvent(event.id);
        console.log(`[overlapDetector:${clusterName}] overlap resolved (no longer active)`);
      }
    }
  } catch (err) {
    console.error('[overlapDetector:scan] error:', err);
  }
}
