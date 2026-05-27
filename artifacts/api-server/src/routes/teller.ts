import { createHash, createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { appendFile } from "node:fs/promises";
import { Router, type IRouter, type Request, type Response } from "express";
import { desc, eq, lte, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { tellerItems, tellerWebhookReceipts } from "@/lib/db/schema";
import {
  exchangePublicToken,
  markItemError,
  removeItem,
  syncAllItems,
  syncTransactionsForItem,
} from "@/lib/services/teller";
import { getV2FinanceOverview } from "@/lib/v2/orchestrator";
import express from "express";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const WEBHOOK_TOLERANCE_MS = 5 * 60 * 1000;
const WEBHOOK_REPLAY_WINDOW_MS = WEBHOOK_TOLERANCE_MS;

type TellerWebhookEvent = {
  id?: string;
  type?: string;
  payload?: {
    enrollment_id?: string;
    item_id?: string;
    error_code?: string;
    account_id?: string;
  } | null;
};

function getWebhookSecret(): string {
  const secret = process.env.TELLER_WEBHOOK_SECRET ?? process.env.OPENCLAW_HOOKS_TOKEN;
  if (!secret) throw new Error('TELLER_WEBHOOK_SECRET or OPENCLAW_HOOKS_TOKEN must be set');
  return secret;
}

function getGatewayHookUrl(): string | undefined {
  return process.env.GATEWAY_HOOK_URL?.trim() || undefined;
}

function verifyWebhookSignature(signatureHeader: string | undefined, rawBody: Buffer): { timestamp: number } {
  if (!signatureHeader) throw new Error('Missing Teller-Signature header');

  const [timestampPart, signaturePart] = signatureHeader.split(',');
  const timestamp = Number(timestampPart?.split('=')[1]);
  const provided = signaturePart?.split('=')[1];
  if (!Number.isFinite(timestamp) || !provided) throw new Error('Invalid Teller-Signature header');

  const ageMs = Math.abs(Date.now() - timestamp * 1000);
  if (ageMs > WEBHOOK_TOLERANCE_MS) throw new Error('Teller webhook timestamp outside tolerance');

  const expected = createHmac('sha256', getWebhookSecret())
    .update(`${timestamp}.${rawBody.toString('utf8')}`)
    .digest('hex');

  const expectedBuffer = Buffer.from(expected, 'hex');
  const providedBuffer = Buffer.from(provided, 'hex');
  if (expectedBuffer.length !== providedBuffer.length || !timingSafeEqual(expectedBuffer, providedBuffer)) {
    throw new Error('Invalid Teller webhook signature');
  }

  return { timestamp };
}

async function appendWebhookLog(rawBody: Buffer): Promise<void> {
  const logPath = process.env.TELLER_BRIDGE_LOG?.trim();
  if (!logPath) return;
  await appendFile(logPath, `${new Date().toISOString()} ${rawBody.toString('utf8')}\n`);
}

async function forwardWebhook(rawBody: Buffer, signature: string | undefined): Promise<void> {
  const gatewayHookUrl = getGatewayHookUrl();
  if (!gatewayHookUrl) return;

  const response = await fetch(gatewayHookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(signature ? { 'Teller-Signature': signature } : {}),
      ...(process.env.OPENCLAW_HOOKS_TOKEN ? { Authorization: `Bearer ${process.env.OPENCLAW_HOOKS_TOKEN}` } : {}),
      ...(process.env.TELLER_BRIDGE_HOST ? { 'X-Teller-Bridge-Host': process.env.TELLER_BRIDGE_HOST } : {}),
      ...(process.env.TELLER_BRIDGE_PORT ? { 'X-Teller-Bridge-Port': process.env.TELLER_BRIDGE_PORT } : {}),
    },
    body: rawBody.toString('utf8'),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Webhook forward failed (${response.status}): ${body}`);
  }
}

function hashWebhookReceipt(signature: string | undefined, rawBody: Buffer) {
  const hash = createHash('sha256');
  if (signature) {
    hash.update(signature);
    hash.update(':');
  }
  hash.update(rawBody);
  return hash.digest('hex');
}

async function rejectReplay(eventId: string | undefined, signatureHash: string) {
  const now = new Date();
  await db.delete(tellerWebhookReceipts).where(lte(tellerWebhookReceipts.expiresAt, now));

  const [existing] = await db
    .select({ id: tellerWebhookReceipts.id })
    .from(tellerWebhookReceipts)
    .where(
      or(
        eq(tellerWebhookReceipts.signatureHash, signatureHash),
        eventId ? eq(tellerWebhookReceipts.eventId, eventId) : undefined,
      ),
    )
    .limit(1);

  if (existing) {
    const error = new Error('Duplicate Teller webhook rejected');
    error.name = 'DuplicateWebhookError';
    throw error;
  }

  await db.insert(tellerWebhookReceipts).values({
    id: randomUUID(),
    eventId: eventId ?? null,
    signatureHash,
    expiresAt: new Date(now.getTime() + WEBHOOK_REPLAY_WINDOW_MS),
  });
}

async function handleWebhookEvent(event: TellerWebhookEvent): Promise<void> {
  const itemId = event.payload?.item_id ?? event.payload?.enrollment_id;

  switch (event.type) {
    case 'enrollment.disconnected':
      if (itemId) await removeItem(itemId);
      return;
    case 'transactions.processed':
      if (itemId) await syncTransactionsForItem(itemId);
      return;
    case 'account.number_verification.processed':
      if (itemId) await markItemError(itemId, event.payload?.error_code ?? 'number_verification_processed', false);
      return;
    case 'webhook.test':
      return;
    default:
      logger.info({ type: event.type, eventId: event.id }, 'ignored teller webhook event');
  }
}

const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response) => {
    fn(req, res).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err, path: req.path }, "teller route failed");
      res.status(500).json({ ok: false, message });
    });
  };

router.post(
  "/teller/webhook",
  express.raw({ type: 'application/json' }),
  wrap(async (req, res) => {
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body ?? {}));
    const signature = typeof req.header('Teller-Signature') === 'string' ? req.header('Teller-Signature') ?? undefined : undefined;
    verifyWebhookSignature(signature, rawBody);
    const event = JSON.parse(rawBody.toString('utf8')) as TellerWebhookEvent;
    const signatureHash = hashWebhookReceipt(signature, rawBody);

    try {
      await rejectReplay(event.id, signatureHash);
    } catch (err) {
      if (err instanceof Error && err.name === 'DuplicateWebhookError') {
        res.status(409).json({ ok: false, error: 'duplicate_webhook', eventId: event.id ?? null });
        return;
      }
      throw err;
    }

    await appendWebhookLog(rawBody);
    await forwardWebhook(rawBody, signature);
    await handleWebhookEvent(event);
    res.status(202).json({ ok: true, type: event.type ?? 'unknown' });
  }),
);

router.get(
  "/teller/items",
  wrap(async (_req, res) => {
    const items = await db
      .select({
        id: tellerItems.itemId,
        institutionName: tellerItems.institutionName,
        updatedAt: tellerItems.updatedAt,
      })
      .from(tellerItems)
      .orderBy(desc(tellerItems.updatedAt));

    res.json({
      items: items.map((item) => ({
        id: item.id,
        institutionName: item.institutionName ?? "Teller",
        updatedAt: item.updatedAt?.toISOString?.() ?? null,
      })),
    });
  }),
);

router.post(
  "/teller/connect",
  wrap(async (req, res) => {
    const accessToken = typeof req.body?.accessToken === "string" ? req.body.accessToken.trim() : "";
    const institutionName = typeof req.body?.institutionName === "string" ? req.body.institutionName.trim() : undefined;

    if (!accessToken) {
      res.status(400).json({ ok: false, error: "accessToken is required" });
      return;
    }

    const result = await exchangePublicToken(accessToken, institutionName);
    res.status(201).json({ ok: true, itemId: result.itemId });
  }),
);

router.post(
  "/teller/sync-transactions",
  wrap(async (_req, res) => {
    const results = await syncAllItems();
    res.json({ ok: true, results });
  }),
);

router.get(
  "/v2/finance/overview",
  wrap(async (_req, res) => {
    res.json(await getV2FinanceOverview());
  }),
);

export default router;
