import { Router, type IRouter, type Request, type Response } from "express";
import {
  deleteChatSession,
  ensureChatSession,
  listAgentSessions,
  readChatMessages,
  saveChatSessionTitle,
} from "../lib/agent-chat";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function apiPath(req: Request) {
  return req.originalUrl.split("?")[0];
}

const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response) => {
    fn(req, res).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err, path: req.path }, "chat route failed");
      res.status(500).json({
        error: {
          code: "CHAT_ROUTE_FAILED",
          message,
          path: apiPath(req),
        },
      });
    });
  };

router.get(
  "/chat/sessions",
  wrap(async (req, res) => {
    const agent = typeof req.query.agent === "string" ? req.query.agent.trim() : "";
    if (!agent) {
      res.status(400).json({
        error: {
          code: "INVALID_INPUT",
          message: "agent query parameter is required",
          path: apiPath(req),
        },
      });
      return;
    }

    const sessions = await listAgentSessions(agent.toLowerCase());
    res.json({ sessions });
  }),
);

router.post(
  "/chat/sessions",
  wrap(async (req, res) => {
    const sessionId = typeof req.body?.id === "string" ? req.body.id.trim() : "";
    if (!sessionId) {
      res.status(400).json({
        error: {
          code: "INVALID_INPUT",
          message: "id is required",
          path: apiPath(req),
        },
      });
      return;
    }

    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    if (title) {
      await saveChatSessionTitle(sessionId, title.slice(0, 80));
    } else {
      await ensureChatSession(sessionId);
    }

    res.status(201).json({
      session: {
        id: sessionId,
        title: title || null,
      },
    });
  }),
);

router.patch(
  "/chat/sessions/:sessionId",
  wrap(async (req, res) => {
    const sessionId = String(req.params.sessionId);
    const title = typeof req.body?.title === "string" ? req.body.title.trim().slice(0, 80) : "";
    if (!title) {
      res.status(400).json({
        error: {
          code: "INVALID_INPUT",
          message: "title is required",
          path: apiPath(req),
        },
      });
      return;
    }

    await saveChatSessionTitle(sessionId, title);
    res.json({ session: { id: sessionId, title } });
  }),
);

router.delete(
  "/chat/sessions/:sessionId",
  wrap(async (req, res) => {
    const sessionId = String(req.params.sessionId);
    await deleteChatSession(sessionId);
    res.json({ ok: true, id: sessionId });
  }),
);

router.get(
  "/chat/messages",
  wrap(async (req, res) => {
    const sessionId = typeof req.query.sessionId === "string" ? req.query.sessionId.trim() : "";
    if (!sessionId) {
      res.status(400).json({
        error: {
          code: "INVALID_INPUT",
          message: "sessionId query parameter is required",
          path: apiPath(req),
        },
      });
      return;
    }

    const messages = await readChatMessages(sessionId);
    res.json({ messages });
  }),
);

export default router;
