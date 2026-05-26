import { Router, type IRouter, type Request, type Response } from "express";
import {
  createV2Task,
  getV2TasksFeed,
  patchV2Task,
  type PatchTaskInput,
} from "@/server/v2";
import wellnessRouter from "./wellness";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const TASK_ACTIONS = new Set<NonNullable<PatchTaskInput["action"]>>([
  "start",
  "defer",
  "complete",
  "unblock",
  "vision_board",
  "block",
  "assign",
]);

function isTaskAction(value: string): value is NonNullable<PatchTaskInput["action"]> {
  return TASK_ACTIONS.has(value as NonNullable<PatchTaskInput["action"]>);
}

const wrap = (
  fn: (req: Request, res: Response) => Promise<unknown>,
) => (req: Request, res: Response) => {
  fn(req, res).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, path: req.path }, "v2 route failed");
    res.status(500).json({ message });
  });
};

router.use("/v2/wellness", wellnessRouter);

router.get("/v2/tasks", wrap(async (_req, res) => {
  res.json(await getV2TasksFeed());
}));

router.post("/v2/tasks", wrap(async (req, res) => {
  const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
  const description = typeof req.body?.description === "string" ? req.body.description.trim() : undefined;
  if (!title) {
    res.status(400).json({ error: { code: "INVALID_INPUT", message: "title is required" } });
    return;
  }
  const task = await createV2Task({ title, description: description || undefined });
  res.status(201).json({ task });
}));

router.patch("/v2/tasks/:id", wrap(async (req, res) => {
  const taskId = String(req.params.id);
  const action = typeof req.body?.action === "string" ? req.body.action : undefined;
  const ownerLogin = typeof req.body?.ownerLogin === "string" ? req.body.ownerLogin : undefined;
  if (!action) {
    res.status(400).json({ error: { code: "INVALID_INPUT", message: "action is required" } });
    return;
  }
  if (!isTaskAction(action)) {
    res.status(400).json({ error: { code: "INVALID_INPUT", message: "unsupported action: " + action } });
    return;
  }
  await patchV2Task(taskId, { action, ownerLogin });
  res.status(204).end();
}));

export default router;
