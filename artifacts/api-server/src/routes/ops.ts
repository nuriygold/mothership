import { Router, type IRouter, type Request, type Response } from "express";
import {
  agents as agentsSvc,
  attempts as attemptsSvc,
  blockers as blockersSvc,
  campaigns as campaignsSvc,
  events as eventsSvc,
  isDispatchBackedCampaign,
  isNonRunnableDemoCampaign,
  legacyDurableOpsDisabledError,
  legacyDurableOpsEnabled,
  projection,
  listWorkflowRegistry,
  runCampaign,
  resumeCampaign,
  seedDemoCampaigns,
  startDispatchBackedCampaign,
  clearDemoCampaigns,
  ensureDemoAgents,
} from "@/lib/ops/engine";
import { logger } from "../lib/logger";
import { readLatestUiWatchdogRun } from "@/lib/watchdog/store";

const router: IRouter = Router();

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    };
  }

  return {
    name: "UnknownError",
    message: String(error),
  };
}

const wrap = (
  fn: (req: Request, res: Response) => Promise<unknown>,
) => (req: Request, res: Response) => {
  fn(req, res).catch((err: unknown) => {
    logger.error({ err, path: req.path }, "ops route failed");
    res.status(500).json({
      error: "ops_route_failed",
      details: serializeError(err),
    });
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

function volatileSystemRulesEnabled() {
  return process.env.ENABLE_VOLATILE_SYSTEM_RULES === "true";
}

async function startCampaignExecution(
  row: NonNullable<Awaited<ReturnType<typeof campaignsSvc.getCampaign>>>,
  mode: "run" | "resume",
) {
  if (isDispatchBackedCampaign(row)) {
    return {
      ok: true as const,
      kind: "dispatch",
      promise: startDispatchBackedCampaign(row.id),
    };
  }

  if (isNonRunnableDemoCampaign(row)) {
    return {
      ok: false as const,
      kind: "demo_non_runnable",
      error: legacyDurableOpsDisabledError(),
    };
  }

  if (!legacyDurableOpsEnabled()) {
    return {
      ok: false as const,
      kind: "legacy_disabled",
      error: legacyDurableOpsDisabledError(),
    };
  }

  return {
    ok: true as const,
    kind: "legacy",
    promise: mode === "resume" ? resumeCampaign(row.id) : runCampaign(row.id),
  };
}

// ─── Ticker ───────────────────────────────────────────────────────────────
router.get(
  "/ops/ticker",
  wrap(async (_req, res) => {
    const campaigns = await projection.projectAllCampaigns();
    res.json(projection.tickerFromCampaigns(campaigns));
  }),
);

router.get(
  "/ops/workflows",
  wrap(async (_req, res) => {
    res.json({ workflows: listWorkflowRegistry() });
  }),
);

// ─── Agents ───────────────────────────────────────────────────────────────
router.get(
  "/ops/agents",
  wrap(async (_req, res) => {
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
    const kickoff = isDispatchBackedCampaign(created)
      ? startDispatchBackedCampaign(created.id)
      : runCampaign(created.id);
    void kickoff.catch((err) => {
      logger.error({ err, campaignId: created.id }, "campaign kickoff failed");
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
        const execution = await startCampaignExecution(row, "resume");
        if (!execution.ok) {
          res.status(501).json(execution.error);
          return;
        }
        const open = await blockersSvc.listOpenBlockers(id);
        for (const b of open) {
          await blockersSvc.resolveBlocker(b.id, "Resolved by operator (resume)");
        }
        void execution.promise.catch((err) => logger.error({ err, id }, "resume failed"));
        break;
      }
      case "force_retry": {
        const execution = await startCampaignExecution(row, "run");
        if (!execution.ok) {
          res.status(501).json(execution.error);
          return;
        }
        await campaignsSvc.setStatus(id, "queued", "Operator: force retry");
        void execution.promise.catch((err) => logger.error({ err, id }, "force_retry failed"));
        break;
      }
      case "approve_action": {
        const execution = await startCampaignExecution(row, "resume");
        if (!execution.ok) {
          res.status(501).json(execution.error);
          return;
        }
        const open = await blockersSvc.listOpenBlockers(id);
        for (const b of open) {
          await blockersSvc.resolveBlocker(b.id, "Approved by operator");
        }
        void execution.promise.catch((err) =>
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
    res.json({ rules: systemRules, mutable: volatileSystemRulesEnabled() });
  }),
);

router.patch(
  "/ops/system-rules",
  wrap(async (req, res) => {
    if (!volatileSystemRulesEnabled()) {
      res.status(501).json({
        error: "system_rules_not_durable",
        message:
          "System rules are disabled until durable persistence is implemented.",
      });
      return;
    }
    const patch = (req.body ?? {}) as Partial<typeof systemRules>;
    Object.assign(systemRules, patch);
    res.json({ rules: systemRules, mutable: true });
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

    const uiRun = await readLatestUiWatchdogRun();
    const uiWatchdog = uiRun
      ? {
          latestRunId: uiRun.runId,
          latestRunAt: uiRun.startedAt,
          overall: uiRun.overall,
          routeCount: uiRun.routeCount,
          failureCount: uiRun.failureCount,
          failingRoutes: uiRun.results
            .filter((result) => result.status === "fail")
            .slice(0, 10)
            .map((result) => ({
              name: result.name,
              path: result.path,
              reason:
                result.fatal ??
                (result.missingExpected[0]
                  ? `missing expected text: ${result.missingExpected[0]}`
                  : result.requestFailures[0]?.failure ??
                    result.consoleErrors[0] ??
                    result.pageErrors[0] ??
                    "unknown failure"),
            })),
        }
      : {
          latestRunId: null,
          latestRunAt: null,
          overall: "unknown" as const,
          routeCount: 0,
          failureCount: 0,
          failingRoutes: [],
        };

    res.json({ inProgress, staleThresholdMinutes, uiWatchdog });
  }),
);

router.post(
  "/ops/watchdog",
  wrap(async (req, res) => {
    const action = String(req.body?.action ?? "");
    const targets = await campaignsSvc.listCampaignsByStatus(["blocked", "running"]);
    let count = 0;
    if (action === "force_resume_all") {
      const resumed: string[] = [];
      const skipped: Array<{ campaignId: string; reason: string; code: string; message: string }> = [];
      for (const c of targets) {
        const execution = await startCampaignExecution(c, "resume");
        if (!execution.ok) {
          await eventsSvc.record(
            c.id,
            "campaign_updated",
            execution.kind === "demo_non_runnable"
              ? "Watchdog skipped non-runnable demo campaign"
              : execution.error.error.message,
          );
          skipped.push({
            campaignId: c.id,
            reason: execution.kind,
            code: execution.error.error.code,
            message: execution.error.error.message,
          });
          count += 1;
          continue;
        }

        const open = await blockersSvc.listOpenBlockers(c.id);
        for (const b of open) {
          await blockersSvc.resolveBlocker(b.id, "Watchdog: force resume");
        }
        void execution.promise.catch((err) =>
          logger.error({ err, id: c.id }, "watchdog resume failed"),
        );
        resumed.push(c.id);
        count += 1;
      }
      res.json({ count, resumed, skipped });
      return;
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
