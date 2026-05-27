import fs from "node:fs";
import path from "node:path";
import { Router, type IRouter, type Request, type Response } from "express";
import { asc, eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import { db } from "@/lib/db/client";
import { DispatchCampaignStatus } from "@/lib/db/enums";
import { dispatchCampaigns, dispatchTasks } from "@/lib/db/schema";
import { createAuditEvent } from "@/lib/services/audit";
import {
  campaignOutputDirName,
  getCampaignOutputDir,
  listOutputFolders,
  pingTelegramCampaignComplete,
  writeCampaignOutput,
  zipCampaignOutputDir,
} from "@/lib/services/campaign-output";
import {
  approveDispatchPlan,
  createDispatchCampaign,
  createDispatchTask,
  enqueueDispatchCampaign,
  generateDispatchPlans,
  getDispatchCampaign,
  getDispatchCampaignProgress,
  listDispatchCampaigns,
  parseDispatchPlanEnvelope,
  processDispatchQueue,
  recommendBotForCampaign,
  replanDispatchTask,
  retryDispatchTask,
  reviewDispatchTask,
  runDispatchCampaign,
  saveDispatchPlanEnvelope,
  scheduleDispatchCampaign,
  setDispatchCampaignStatus,
} from "@/lib/services/dispatch";
import { dispatchToOpenClaw } from "@/lib/services/openclaw";

const router: IRouter = Router();

const BOT_DISPLAY: Record<string, string> = {
  adrian: "Adrian",
  main: "Adrian",
  iceman: "Iceman",
  ruby: "Ruby",
  emerald: "Emerald",
  adobe: "Adobe Pettaway",
  anchor: "Anchor",
};

const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response) => {
    fn(req, res).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err, path: req.path }, "dispatch route failed");
      res.status(500).json({ ok: false, message });
    });
  };

function legacyDispatchIngressEnabled() {
  return process.env.ENABLE_LEGACY_DISPATCH_INGRESS === "true";
}

function rejectLegacyDispatchIngress(res: Response) {
  res.status(501).json({
    ok: false,
    error: "legacy_dispatch_ingress_disabled",
    message:
      "Legacy dispatch HTTP ingress is disabled. Create campaigns through /api/ops/campaigns instead.",
  });
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text ? text : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string" && value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

router.get(
  "/dispatch/campaigns",
  wrap(async (_req, res) => {
    const campaigns = await listDispatchCampaigns();
    res.json(campaigns);
  }),
);

router.post(
  "/dispatch/campaigns",
  wrap(async (req, res) => {
    if (!legacyDispatchIngressEnabled()) {
      rejectLegacyDispatchIngress(res);
      return;
    }
    const title = String(req.body?.title ?? "").trim();
    if (!title) {
      res.status(400).json({ ok: false, message: "Title is required" });
      return;
    }

    const campaign = await createDispatchCampaign({
      title,
      description: optionalString(req.body?.description),
      costBudgetCents: optionalNumber(req.body?.costBudgetCents),
      timeBudgetSeconds: optionalNumber(req.body?.timeBudgetSeconds),
      callbackUrl: optionalString(req.body?.callbackUrl),
      callbackSecret: optionalString(req.body?.callbackSecret),
      projectId: optionalString(req.body?.projectId),
      visionItemId: optionalString(req.body?.visionItemId),
      outputFolder: optionalString(req.body?.outputFolder),
      assignedBotId: optionalString(req.body?.assignedBotId),
      revenueStream: optionalString(req.body?.revenueStream),
      linkedTaskRef: optionalString(req.body?.linkedTaskRef),
    });

    res.status(201).json({ campaign });
  }),
);

router.get(
  "/dispatch/campaigns/:id",
  wrap(async (req, res) => {
    const campaign = await getDispatchCampaign(String(req.params.id));
    if (!campaign) {
      res.status(404).json({ ok: false, message: "Campaign not found" });
      return;
    }
    res.json(campaign);
  }),
);

router.delete(
  "/dispatch/campaigns/:id",
  wrap(async (req, res) => {
    if (!legacyDispatchIngressEnabled()) {
      rejectLegacyDispatchIngress(res);
      return;
    }
    const reason =
      typeof req.body?.reason === "string"
        ? req.body.reason.trim().slice(0, 500)
        : "";

    const [campaign] = await db
      .select({
        id: dispatchCampaigns.id,
        title: dispatchCampaigns.title,
        status: dispatchCampaigns.status,
      })
      .from(dispatchCampaigns)
      .where(eq(dispatchCampaigns.id, String(req.params.id)))
      .limit(1);

    if (!campaign) {
      res.status(404).json({ ok: false, message: "Campaign not found" });
      return;
    }

    await db.delete(dispatchTasks).where(eq(dispatchTasks.campaignId, campaign.id));
    await db.delete(dispatchCampaigns).where(eq(dispatchCampaigns.id, campaign.id));

    await createAuditEvent({
      entityType: "DispatchCampaign",
      entityId: campaign.id,
      eventType: "DELETED",
      actorId: "user",
      metadata: {
        description: `Campaign "${campaign.title}" deleted${reason ? ` — ${reason}` : ""}`,
        title: campaign.title,
        previousStatus: campaign.status,
        reason: reason || null,
        category: "Campaigns",
      },
    }).catch(() => undefined);

    res.json({ ok: true, id: campaign.id, reason });
  }),
);

router.post(
  "/dispatch/campaigns/:id/trophy",
  wrap(async (req, res) => {
    if (!legacyDispatchIngressEnabled()) {
      rejectLegacyDispatchIngress(res);
      return;
    }
    const [campaign] = await db
      .select()
      .from(dispatchCampaigns)
      .where(eq(dispatchCampaigns.id, String(req.params.id)))
      .limit(1);
    if (!campaign) {
      res.status(404).json({ ok: false, message: "Campaign not found" });
      return;
    }

    const tasks = await db
      .select({ status: dispatchTasks.status })
      .from(dispatchTasks)
      .where(eq(dispatchTasks.campaignId, campaign.id));

    const alreadyCompleted =
      campaign.status === DispatchCampaignStatus.COMPLETED;

    if (!alreadyCompleted) {
      await db
        .update(dispatchCampaigns)
        .set({
          status: DispatchCampaignStatus.COMPLETED,
          updatedAt: new Date(),
        })
        .where(eq(dispatchCampaigns.id, campaign.id));
    }

    void writeCampaignOutput(campaign.id).catch(() => undefined);
    if (!alreadyCompleted) {
      void pingTelegramCampaignComplete({
        id: campaign.id,
        title: campaign.title,
        status: DispatchCampaignStatus.COMPLETED,
        tasks,
      }).catch(() => undefined);
    }

    await createAuditEvent({
      entityType: "DispatchCampaign",
      entityId: campaign.id,
      eventType: "TROPHIED",
      actorId: "user",
      metadata: {
        description: `Campaign "${campaign.title}" moved to the Trophy Case`,
        title: campaign.title,
        previousStatus: campaign.status,
        category: "Campaigns",
      },
    }).catch(() => undefined);

    res.json({ ok: true, id: campaign.id });
  }),
);

router.post(
  "/dispatch/campaigns/:id/send-to-bot",
  wrap(async (req, res) => {
    if (!legacyDispatchIngressEnabled()) {
      rejectLegacyDispatchIngress(res);
      return;
    }
    const botId = String(req.body?.botId ?? "").trim();
    const note = optionalString(req.body?.note) ?? "";
    if (!botId) {
      res.status(400).json({ ok: false, message: "botId is required" });
      return;
    }

    const [campaign] = await db
      .select()
      .from(dispatchCampaigns)
      .where(eq(dispatchCampaigns.id, String(req.params.id)))
      .limit(1);
    if (!campaign) {
      res.status(404).json({ ok: false, message: "Campaign not found" });
      return;
    }

    const tasks = await db
      .select()
      .from(dispatchTasks)
      .where(eq(dispatchTasks.campaignId, campaign.id))
      .orderBy(asc(dispatchTasks.priority), asc(dispatchTasks.createdAt));

    const taskSummary = tasks
      .map((task, index) => {
        const icon =
          task.status === "DONE"
            ? "✅"
            : task.status === "FAILED"
              ? "❌"
              : "⏳";
        const output = task.output ? `\n\n${task.output}` : "";
        return `### ${index + 1}. ${task.title} (${task.status})${output}`;
      })
      .join("\n\n---\n\n");

    const prompt = [
      `# Campaign Assignment: ${campaign.title}`,
      "",
      note ? `**Note from dispatcher:** ${note}` : null,
      "",
      `**Status:** ${campaign.status}`,
      campaign.description ? `**Objective:** ${campaign.description}` : null,
      "",
      "## Task Outputs",
      "",
      taskSummary,
    ]
      .filter((line): line is string => line !== null)
      .join("\n");

    const result = await dispatchToOpenClaw({
      text: prompt,
      agentId: botId,
      sessionKey: `send-to-bot:${campaign.id}:${Date.now()}`,
    });

    await createAuditEvent({
      entityType: "DispatchCampaign",
      entityId: campaign.id,
      eventType: "SENT_TO_BOT",
      actorId: "user",
      metadata: {
        botId,
        botName: BOT_DISPLAY[botId] ?? botId,
        note: note || null,
        campaignTitle: campaign.title,
      },
    }).catch(() => undefined);

    res.json({
      ok: true,
      botId,
      botName: BOT_DISPLAY[botId] ?? botId,
      result,
    });
  }),
);

router.post(
  "/dispatch/campaigns/:id/tasks",
  wrap(async (req, res) => {
    if (!legacyDispatchIngressEnabled()) {
      rejectLegacyDispatchIngress(res);
      return;
    }
    const title = String(req.body?.title ?? "").trim();
    if (!title) {
      res.status(400).json({ ok: false, message: "Title is required" });
      return;
    }

    const task = await createDispatchTask(String(req.params.id), {
      title,
      description: optionalString(req.body?.description),
      priority: optionalNumber(req.body?.priority),
      dependencies: Array.isArray(req.body?.dependencies)
        ? req.body.dependencies.map(String).filter(Boolean)
        : undefined,
      toolRequirements: Array.isArray(req.body?.toolRequirements)
        ? req.body.toolRequirements.map(String).filter(Boolean)
        : undefined,
    });

    res.status(201).json({ task });
  }),
);

router.post(
  "/dispatch/campaigns/:id/plan",
  wrap(async (req, res) => {
    if (!legacyDispatchIngressEnabled()) {
      rejectLegacyDispatchIngress(res);
      return;
    }
    const result = await generateDispatchPlans(String(req.params.id));
    res.json(result);
  }),
);

router.post(
  "/dispatch/campaigns/:id/plan/approve",
  wrap(async (req, res) => {
    if (!legacyDispatchIngressEnabled()) {
      rejectLegacyDispatchIngress(res);
      return;
    }
    const campaign = await approveDispatchPlan(
      String(req.params.id),
      optionalString(req.body?.planName),
    );
    res.json({ campaign });
  }),
);

router.post(
  "/dispatch/campaigns/:id/plan/convert",
  wrap(async (req, res) => {
    if (!legacyDispatchIngressEnabled()) {
      rejectLegacyDispatchIngress(res);
      return;
    }
    const rawJson = String(req.body?.rawJson ?? req.body?.text ?? "").trim();
    if (!rawJson) {
      res.status(400).json({ ok: false, message: "rawJson is required" });
      return;
    }

    const parsed = parseDispatchPlanEnvelope(rawJson);
    if (!parsed) {
      res.status(400).json({
        ok: false,
        message: "Could not parse a plan envelope from the provided JSON",
      });
      return;
    }

    const result = await saveDispatchPlanEnvelope(
      String(req.params.id),
      parsed,
      "manual-json",
    );
    res.json(result);
  }),
);

router.post(
  "/dispatch/campaigns/:id/pause",
  wrap(async (req, res) => {
    if (!legacyDispatchIngressEnabled()) {
      rejectLegacyDispatchIngress(res);
      return;
    }
    const campaign = await setDispatchCampaignStatus(
      String(req.params.id),
      DispatchCampaignStatus.PAUSED,
    );
    res.json({ campaign });
  }),
);

router.post(
  "/dispatch/campaigns/:id/resume",
  wrap(async (req, res) => {
    if (!legacyDispatchIngressEnabled()) {
      rejectLegacyDispatchIngress(res);
      return;
    }
    const campaign = await enqueueDispatchCampaign(String(req.params.id));
    res.json({ campaign });
  }),
);

router.get(
  "/dispatch/campaigns/:id/progress",
  wrap(async (req, res) => {
    const progress = await getDispatchCampaignProgress(String(req.params.id));
    res.json(progress);
  }),
);

router.get(
  "/dispatch/campaigns/:id/recommend",
  wrap(async (req, res) => {
    const recommendation = await recommendBotForCampaign(String(req.params.id));
    res.json(recommendation);
  }),
);

router.post(
  "/dispatch/campaigns/:id/run",
  wrap(async (req, res) => {
    if (!legacyDispatchIngressEnabled()) {
      rejectLegacyDispatchIngress(res);
      return;
    }
    const mode = String(req.body?.mode ?? "now");
    if (mode === "queue") {
      const campaign = await enqueueDispatchCampaign(String(req.params.id));
      res.json({ campaign });
      return;
    }

    if (mode === "schedule") {
      const scheduledAt = req.body?.scheduledAt
        ? new Date(String(req.body.scheduledAt))
        : null;
      if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) {
        res.status(400).json({
          ok: false,
          message: "scheduledAt (ISO string) is required for schedule mode",
        });
        return;
      }
      const campaign = await scheduleDispatchCampaign(
        String(req.params.id),
        scheduledAt,
      );
      res.json({ campaign });
      return;
    }

    void runDispatchCampaign(String(req.params.id)).catch((err) =>
      logger.error({ err, campaignId: req.params.id }, "dispatch run failed"),
    );
    res.json({
      ok: true,
      status: "EXECUTING",
      message: "Campaign execution started",
    });
  }),
);

router.post(
  "/dispatch/campaigns/:id/tasks/:taskId/retry",
  wrap(async (req, res) => {
    if (!legacyDispatchIngressEnabled()) {
      rejectLegacyDispatchIngress(res);
      return;
    }
    const agentId = optionalString(req.body?.agentId);
    void retryDispatchTask(String(req.params.taskId), agentId).catch((err) =>
      logger.error({ err, taskId: req.params.taskId }, "dispatch retry failed"),
    );
    res.json({ ok: true, status: "QUEUED", message: "Task retry started" });
  }),
);

router.post(
  "/dispatch/campaigns/:id/tasks/:taskId/review",
  wrap(async (req, res) => {
    if (!legacyDispatchIngressEnabled()) {
      rejectLegacyDispatchIngress(res);
      return;
    }
    void reviewDispatchTask(String(req.params.taskId)).catch((err) =>
      logger.error({ err, taskId: req.params.taskId }, "dispatch review failed"),
    );
    res.json({
      ok: true,
      status: "REVIEWING",
      message: "Emerald review started",
    });
  }),
);

router.post(
  "/dispatch/campaigns/:id/tasks/:taskId/replan",
  wrap(async (req, res) => {
    if (!legacyDispatchIngressEnabled()) {
      rejectLegacyDispatchIngress(res);
      return;
    }
    void replanDispatchTask(String(req.params.id), String(req.params.taskId)).catch(
      (err) =>
        logger.error({ err, taskId: req.params.taskId }, "dispatch replan failed"),
    );
    res.json({ ok: true, status: "REPLANNING", message: "Re-plan started" });
  }),
);

router.get(
  "/dispatch/campaigns/:id/download",
  wrap(async (req, res) => {
    const taskId = optionalString(req.query.task);
    const [campaign] = await db
      .select()
      .from(dispatchCampaigns)
      .where(eq(dispatchCampaigns.id, String(req.params.id)))
      .limit(1);

    if (!campaign) {
      res.status(404).json({ ok: false, message: "Campaign not found" });
      return;
    }

    const tasks = await db
      .select()
      .from(dispatchTasks)
      .where(eq(dispatchTasks.campaignId, campaign.id))
      .orderBy(asc(dispatchTasks.priority), asc(dispatchTasks.createdAt));

    let outputDir = await getCampaignOutputDir(campaign.id);
    if (!outputDir) {
      outputDir = await writeCampaignOutput(campaign.id);
    }
    if (!outputDir) {
      res
        .status(500)
        .json({ ok: false, message: "Could not write output files" });
      return;
    }

    if (taskId) {
      const taskIndex = tasks.findIndex((task) => task.id === taskId);
      if (taskIndex === -1) {
        res.status(404).json({ ok: false, message: "Task not found" });
        return;
      }
      const task = tasks[taskIndex];
      const slug = task.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 50);
      const filename = `${String(taskIndex + 1).padStart(2, "0")}-${slug}.md`;
      const filePath = path.join(outputDir, filename);
      if (!fs.existsSync(filePath)) {
        res.status(404).json({ ok: false, message: "File not found" });
        return;
      }

      const content = fs.readFileSync(filePath, "utf8");
      res.setHeader("Content-Type", "text/markdown; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`,
      );
      res.send(content);
      return;
    }

    const zipBuffer = zipCampaignOutputDir(outputDir);
    if (!zipBuffer) {
      res
        .status(500)
        .json({ ok: false, message: "Failed to create zip archive" });
      return;
    }

    const zipName = `${campaignOutputDirName(
      campaign.title,
      campaign.createdAt,
    )}.zip`;
    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${zipName}"`,
    );
    res.send(zipBuffer);
  }),
);

router.get(
  "/dispatch/output-folders",
  wrap(async (_req, res) => {
    res.json({ folders: listOutputFolders() });
  }),
);

router.get(
  "/dispatch/worker",
  wrap(async (req, res) => {
    const secret =
      req.header("x-cron-secret") ??
      req.header("authorization")?.replace(/^Bearer\s+/i, "") ??
      optionalString(req.query.secret);

    if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
      res.status(401).json({ ok: false, message: "Unauthorized" });
      return;
    }

    void processDispatchQueue()
      .then(({ processed, skipped }) => {
        logger.info({ processed, skipped }, "dispatch worker completed");
      })
      .catch((err) => logger.error({ err }, "dispatch worker failed"));

    res.json({ ok: true, message: "Worker triggered" });
  }),
);

export default router;
