import { Router, type IRouter, type Request, type Response } from "express";
import {
  dispatchAgentTurn,
  resolveDispatchAgentId,
  startSseResponse,
  writeSseJson,
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
      logger.error({ err, path: req.path }, "agent route failed");
      res.status(500).json({
        error: {
          code: "AGENT_ROUTE_FAILED",
          message,
          path: apiPath(req),
        },
      });
    });
  };

router.all(
  "/agent",
  wrap(async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({
        error: {
          code: "METHOD_NOT_ALLOWED",
          message: "Use POST for /api/agent.",
          path: apiPath(req),
        },
      });
      return;
    }

    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    const sessionId = typeof req.body?.sessionId === "string" ? req.body.sessionId.trim() : "";
    if (!text) {
      res.status(400).json({
        error: {
          code: "INVALID_INPUT",
          message: "text is required",
          path: apiPath(req),
        },
      });
      return;
    }
    if (!sessionId) {
      res.status(400).json({
        error: {
          code: "INVALID_INPUT",
          message: "sessionId is required",
          path: apiPath(req),
        },
      });
      return;
    }

    const requestedAgent = typeof req.body?.agent === "string" ? req.body.agent : undefined;
    const agentId = resolveDispatchAgentId({
      agent: requestedAgent,
      sessionId,
    });
    const result = await dispatchAgentTurn({
      text,
      sessionId,
      agentId,
    });

    startSseResponse(res);
    writeSseJson(res, { delta: result.output });
    res.write("data: [DONE]\n\n");
    res.end();
  }),
);

export default router;
