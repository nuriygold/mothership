import { Router, type IRouter, type Request, type Response } from "express";
import {
  agents as agentsSvc,
  attempts as attemptsSvc,
  blockers as blockersSvc,
  campaigns as campaignsSvc,
  events as eventsSvc,
  projection,
  runCampaign,
  resumeCampaign,
  seedDemoCampaigns,
  clearDemoCampaigns,
  ensureDemoAgents,
} from "@/lib/ops/engine";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const wrap = (
  fn: (req: Request, res: Response) => Promise<unknown>,
) => (req: Request, res: Response) => {
  fn(req, res).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, path: req.path }, "ops route failed");
    res.status(500).json({ message });
  });
};

// ─── In-memory system rules (UI tunables, not durable yet) ────────────────
const systemRules = {
  executionMode: true,
  fallbackEnforcement: true,
  batchMinimum: 5,
  watchdogIntervalMinutes: 5,
  blockerThreshold: 3,
};

// ─── Ticker ───────────────────────────────────────────────────────────────
router.get(
  "/ops/ticker",
  wrap(async (_req, res) => {
    const campaigns = await projection.projectAllCampaigns();
    res.json(projection.tickerFromCampaigns(campaigns));
  }),
);

// ─── Agents ───────────────────────────────────────────────────────────────
router.get(
  "/ops/agents",
  wrap(async (_req, res) => {
    await ensureDemoAgents();
    const agents = await projection.projectAllAgents();
    res.json({ agents });
  }),
);

// ─── Campaigns ────────────────────────────────────────────────────────────
router.get(
  "/ops/campaigns",
  wrap(async (_req, res) => {
    const campaigns = await projection.projectAllCampaigns();
    res.json({ campaigns });
  }),
);

router.get(
  "/ops/campaigns/:id",
  wrap(async (req, res) => {
    const row = await campaignsSvc.getCampaign(String(req.params.id));
    if (!row) {
      res.status(404).json({ message: "Campaign not found" });
      return;
    }
    res.json({ campaign: await projection.projectCampaign(row) });
  }),
);

router.get(
  "/ops/campaigns/:id/feed",
  wrap(async (req, res) => {
    const row = await campaignsSvc.getCampaign(String(req.params.id));
    if (!row) {
      res.status(404).json({ message: "Campaign not found" });
      return;
    }

    const campaign = await projection.projectCampaign(row);
    res.json({ events: campaign.feed });
  }),
);

router.post(
  "/ops/campaigns",
  wrap(async (req, res) => {
    const input = req.body as Parameters<typeof projection.uiCreateInputToDb>[0];
    if (!input?.name || !input?.objective) {
      res.status(400).json({ message: "name and objective are required" });
      return;
    }
    const dbInput = projection.uiCreateInputToDb(input);
    const created = await campaignsSvc.createCampaign(dbInput);
    // Kick the engine; resolve immediately and let it run.
    void runCampaign(created.id).catch((err) => {
      logger.error({ err, campaignId: created.id }, "runCampaign failed");
    });
    res.status(201).json({ campaign: await projection.projectCampaign(created) });
  }),
);

// ─── Control actions ──────────────────────────────────────────────────────
router.post(
  "/ops/campaigns/:id/control",
  wrap(async (req, res) => {
    const id = String(req.params.id);
    const action = String(req.body?.action ?? "");
    const row = await campaignsSvc.getCampaign(id);
    if (!row) {
      res.status(404).json({ message: "Campaign not found" });
      return;
    }

    switch (action) {
      case "resume": {
        const open = await blockersSvc.listOpenBlockers(id);
        for (const b of open) {
          await blockersSvc.resolveBlocker(b.id, "Resolved by operator (resume)");
        }
        void resumeCampaign(id).catch((err) =>
          logger.error({ err, id }, "resume failed"),
        );
        break;
      }
      case "force_retry": {
        await campaignsSvc.setStatus(id, "queued", "Operator: force retry");
        void runCampaign(id).catch((err) =>
          logger.error({ err, id }, "force_retry failed"),
        );
        break;
      }
      case "approve_action": {
        const open = await blockersSvc.listOpenBlockers(id);
        for (const b of open) {
          await blockersSvc.resolveBlocker(b.id, "Approved by operator");
        }
        void resumeCampaign(id).catch((err) =>
          logger.error({ err, id }, "approve_action failed"),
        );
        break;
      }
      case "escalate": {
        await eventsSvc.record(id, "approval_requested", "Escalated to operator review");
        break;
      }
      case "kill": {
        await campaignsSvc.setStatus(id, "archived", "Operator: kill");
        break;
      }
      default:
        res.status(400).json({ message: `Unknown action: ${action}` });
        return;
    }

    const fresh = await campaignsSvc.getCampaign(id);
    res.json({ campaign: fresh ? await projection.projectCampaign(fresh) : null });
  }),
);

// ─── System rules ─────────────────────────────────────────────────────────
router.get(
  "/ops/system-rules",
  wrap(async (_req, res) => {
    res.json({ rules: systemRules });
  }),
);

router.patch(
  "/ops/system-rules",
  wrap(async (req, res) => {
    const patch = (req.body ?? {}) as Partial<typeof systemRules>;
    Object.assign(systemRules, patch);
    res.json({ rules: systemRules });
  }),
);

// ─── Watchdog ─────────────────────────────────────────────────────────────
router.get(
  "/ops/watchdog",
  wrap(async (_req, res) => {
    const staleThresholdMinutes = systemRules.watchdogIntervalMinutes;
    const staleMs = staleThresholdMinutes * 60 * 1000;
    const now = Date.now();
    const campaigns = await projection.projectAllCampaigns();
    const agentsList = await agentsSvc.listAgents();
    const agentsById = new Map(agentsList.map((a) => [a.id, a]));

    const inProgress = campaigns
      .filter((c) => c.status === "RUNNING" || c.status === "BLOCKED" || c.status === "DEPLOYING")
      .map((c) => {
        const lastActivityMs = new Date(c.lastActivityAt).getTime();
        const isStale = Number.isFinite(lastActivityMs)
          ? now - lastActivityMs > staleMs
          : false;
        const lead = agentsById.get(c.leadAgentId);
        return {
          campaignId: c.id,
          name: c.name,
          leadAgentName: lead?.name ?? "—",
          lastActivityAt: c.lastActivityAt,
          isStale,
          isMissingArtifacts:
            c.requiredArtifacts.length > 0 &&
            c.requiredArtifacts.some(
              (req) => !c.artifacts.some((a) => a.name === req),
            ),
          hasInvalidBlocker: c.status === "BLOCKED" && !c.blocker,
        };
      });

    res.json({ inProgress, staleThresholdMinutes });
  }),
);

router.post(
  "/ops/watchdog",
  wrap(async (req, res) => {
    const action = String(req.body?.action ?? "");
    const targets = await campaignsSvc.listCampaignsByStatus(["blocked", "running"]);
    let count = 0;
    if (action === "force_resume_all") {
      for (const c of targets) {
        const open = await blockersSvc.listOpenBlockers(c.id);
        for (const b of open) {
          await blockersSvc.resolveBlocker(b.id, "Watchdog: force resume");
        }
        void resumeCampaign(c.id).catch((err) =>
          logger.error({ err, id: c.id }, "watchdog resume failed"),
        );
        count += 1;
      }
    } else if (action === "escalate_all") {
      for (const c of targets) {
        await eventsSvc.record(c.id, "approval_requested", "Watchdog: escalate");
        count += 1;
      }
    } else {
      res.status(400).json({ message: `Unknown action: ${action}` });
      return;
    }
    res.json({ count });
  }),
);

// ─── Demo seed/reset ──────────────────────────────────────────────────────
router.post(
  "/ops/demo-seed",
  wrap(async (_req, res) => {
    const { created } = await seedDemoCampaigns();
    res.json({ created });
  }),
);

router.delete(
  "/ops/demo-seed",
  wrap(async (_req, res) => {
    const { removed } = await clearDemoCampaigns();
    res.json({ removed });
  }),
);

// Suppress unused import warning — attemptsSvc reserved for future detail routes.
void attemptsSvc;

export default router;
