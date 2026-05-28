import { Router, type IRouter, type Request, type Response } from "express";
import { sendTelegramMessage } from "@/lib/services/telegram";
import { logger } from "../lib/logger";

const router: IRouter = Router();

type StreamEvent = {
  id: string;
  timestamp: string;
  direction: "inbound" | "outbound";
  text: string;
  chatId: string;
  botKey: string;
  agentLabel: string;
};

const streamEvents: StreamEvent[] = [];

const AGENT_LABELS: Record<string, string> = {
  bot1: "Adrian",
  bot2: "Ruby",
  bot3: "Emerald",
  botAdobe: "Adobe",
  default: "Ruby",
};

const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response) => {
    fn(req, res).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err, path: req.path }, "telegram route failed");
      res.status(500).json({ message });
    });
  };

router.get(
  "/telegram/streams",
  wrap(async (_req, res) => {
    res.json({ events: streamEvents.slice(0, 100) });
  }),
);

router.post(
  "/telegram/send",
  wrap(async (req, res) => {
    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    const botKey = typeof req.body?.botKey === "string" ? req.body.botKey.trim() : undefined;
    if (!text) {
      res.status(400).json({ message: "text is required" });
      return;
    }

    const result = await sendTelegramMessage({ text, botKey: botKey as any });
    streamEvents.unshift({
      id: String(result?.result?.message_id ?? Date.now()),
      timestamp: new Date().toISOString(),
      direction: "outbound",
      text,
      chatId: String(result?.result?.chat?.id ?? process.env.TELEGRAM_CHAT_ID ?? ""),
      botKey: botKey ?? "default",
      agentLabel: AGENT_LABELS[botKey ?? "default"] ?? "Ruby",
    });
    if (streamEvents.length > 200) streamEvents.length = 200;

    res.json({ ok: true, result });
  }),
);

export default router;
