import { Router, type IRouter, type Request, type Response } from "express";
import { createCommand, listCommands } from "@/lib/services/commands";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response) => {
    fn(req, res).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err, path: req.path }, "commands route failed");
      res.status(500).json({ message });
    });
  };

router.get(
  "/commands",
  wrap(async (_req, res) => {
    res.json(await listCommands());
  }),
);

router.post(
  "/commands",
  wrap(async (req, res) => {
    const input = typeof req.body?.input === "string" ? req.body.input.trim() : "";
    const sourceChannel = typeof req.body?.sourceChannel === "string" ? req.body.sourceChannel.trim() : "";

    if (!input) {
      res.status(400).json({ message: "input is required" });
      return;
    }
    if (!sourceChannel) {
      res.status(400).json({ message: "sourceChannel is required" });
      return;
    }

    const command = await createCommand({
      input,
      sourceChannel,
      requestedById: typeof req.body?.requestedById === "string" ? req.body.requestedById : null,
    });

    res.status(201).json(command);
  }),
);

export default router;
