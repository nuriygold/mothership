import { Router, type IRouter, type Request, type Response } from "express";
import {
  assignCampaignToProject,
  createProject,
  listProjects,
} from "@/lib/services/projects";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response) => {
    fn(req, res).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err, path: req.path }, "projects route failed");
      res.status(500).json({ error: message });
    });
  };

router.get(
  "/projects",
  wrap(async (_req, res) => {
    res.json(await listProjects());
  }),
);

router.post(
  "/projects",
  wrap(async (req, res) => {
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    if (!title) {
      res.status(400).json({ error: "title is required" });
      return;
    }

    const project = await createProject({
      title,
      description: typeof req.body?.description === "string" ? req.body.description.trim() || undefined : undefined,
      color: typeof req.body?.color === "string" ? req.body.color : undefined,
      icon: typeof req.body?.icon === "string" ? req.body.icon : undefined,
    });

    res.status(201).json(project);
  }),
);

router.patch(
  "/projects/:id",
  wrap(async (req, res) => {
    const projectId = String(req.params.id);
    const assignCampaignId = typeof req.body?.assignCampaignId === "string" ? req.body.assignCampaignId.trim() : "";
    if (!assignCampaignId) {
      res.status(400).json({ error: "assignCampaignId is required" });
      return;
    }

    const updated = await assignCampaignToProject(assignCampaignId, projectId);
    res.json({ ok: true, campaign: updated });
  }),
);

export default router;
