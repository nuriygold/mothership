import { Router, type IRouter, type Request, type Response } from "express";
import { timingSafeEqual } from "node:crypto";
import {
  createV2Task,
  getV2TasksFeed,
  patchV2Task,
  type PatchTaskInput,
} from "@/server/v2";
import wellnessRouter from "./wellness";
import {
  deleteChatSession,
  dispatchAgentTurn,
  ensureChatSession,
  isSupportedV2Agent,
  listAgentSessions,
  readChatMessages,
  resolveDispatchAgentId,
  saveChatSessionTitle,
  startSseResponse,
  writeSseJson,
} from "../lib/agent-chat";
import { logger } from "../lib/logger";
import {
  createOwnerCookieValue,
  getOwnerCookieMaxAgeSeconds,
  getOwnerPassphrase,
  OWNER_COOKIE,
  OWNER_COOKIE_SUBJECT,
  verifyOwnerCookieValue,
} from "@/lib/auth/owner-cookie";

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

function apiPath(req: Request) {
  return req.originalUrl.split("?")[0];
}

function safeEqualString(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

router.use("/v2/wellness", wellnessRouter);

router.post("/v2/auth/login", wrap(async (req, res) => {
  const configuredPassphrase = getOwnerPassphrase();
  if (!configuredPassphrase) {
    res.status(501).json({
      error: {
        code: "OWNER_LOGIN_NOT_CONFIGURED",
        message: "Owner passphrase authentication is not configured.",
        path: apiPath(req),
      },
    });
    return;
  }

  const passphrase = typeof req.body?.passphrase === "string" ? req.body.passphrase : "";
  if (!passphrase) {
    res.status(400).json({
      error: {
        code: "INVALID_INPUT",
        message: "passphrase is required",
        path: apiPath(req),
      },
    });
    return;
  }

  if (!safeEqualString(configuredPassphrase, passphrase)) {
    res.status(401).json({
      error: {
        code: "INVALID_PASSPHRASE",
        message: "Incorrect passphrase",
        path: apiPath(req),
      },
    });
    return;
  }

  res.cookie(OWNER_COOKIE, createOwnerCookieValue(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: getOwnerCookieMaxAgeSeconds() * 1000,
    path: "/",
  });

  res.json({
    ok: true,
    owner: OWNER_COOKIE_SUBJECT,
  });
}));

router.post("/v2/auth/logout", wrap(async (_req, res) => {
  res.clearCookie(OWNER_COOKIE, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  res.json({ ok: true });
}));

router.get("/v2/auth/me", wrap(async (req, res) => {
  const verification = verifyOwnerCookieValue(req.cookies?.[OWNER_COOKIE]);
  if (!verification.ok) {
    res.status(401).json({
      error: {
        code: "UNAUTHORIZED",
        message: "Owner authentication required.",
        path: apiPath(req),
      },
    });
    return;
  }

  res.json({
    ok: true,
    owner: OWNER_COOKIE_SUBJECT,
    expiresAt: new Date(verification.payload.exp * 1000).toISOString(),
  });
}));

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

router.get(
  "/v2/:agent/sessions",
  wrap(async (req, res) => {
    const agent = String(req.params.agent).trim().toLowerCase();
    if (!agent) {
      res.status(400).json({ error: { code: "INVALID_INPUT", message: "agent is required" } });
      return;
    }

    res.json({ sessions: await listAgentSessions(agent) });
  }),
);

router.post(
  "/v2/:agent/sessions",
  wrap(async (req, res) => {
    const agent = String(req.params.agent).trim().toLowerCase();
    const sessionId = typeof req.body?.id === "string" ? req.body.id.trim() : "";
    if (!sessionId) {
      res.status(400).json({ error: { code: "INVALID_INPUT", message: "id is required" } });
      return;
    }
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    if (title) {
      await saveChatSessionTitle(sessionId, title.slice(0, 80));
    } else {
      await ensureChatSession(sessionId);
    }
    res.status(201).json({ session: { id: sessionId, title: title || null, agent } });
  }),
);

router.patch(
  "/v2/:agent/sessions/:sessionId",
  wrap(async (req, res) => {
    const sessionId = String(req.params.sessionId);
    const title = typeof req.body?.title === "string" ? req.body.title.trim().slice(0, 80) : "";
    if (!title) {
      res.status(400).json({ error: { code: "INVALID_INPUT", message: "title is required" } });
      return;
    }
    await saveChatSessionTitle(sessionId, title);
    res.json({ session: { id: sessionId, title } });
  }),
);

router.delete(
  "/v2/:agent/sessions/:sessionId",
  wrap(async (req, res) => {
    const sessionId = String(req.params.sessionId);
    await deleteChatSession(sessionId);
    res.json({ ok: true, id: sessionId });
  }),
);

router.get(
  "/v2/:agent/messages",
  wrap(async (req, res) => {
    const sessionId = typeof req.query.sessionId === "string" ? req.query.sessionId.trim() : "";
    if (!sessionId) {
      res.status(400).json({ error: { code: "INVALID_INPUT", message: "sessionId is required" } });
      return;
    }
    res.json({ messages: await readChatMessages(sessionId) });
  }),
);

router.all(
  "/v2/:agent/dispatch",
  wrap(async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({
        error: {
          code: "METHOD_NOT_ALLOWED",
          message: "Use POST for /api/v2/:agent/dispatch.",
        },
      });
      return;
    }

    const routeAgent = String(req.params.agent).trim().toLowerCase();
    if (!isSupportedV2Agent(routeAgent)) {
      res.status(501).json({
        error: {
          code: "AGENT_DISPATCH_ROUTE_NOT_IMPLEMENTED",
          message: `No /api/v2/${routeAgent}/dispatch route is mounted for this agent.`,
        },
      });
      return;
    }

    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    const sessionId = typeof req.body?.sessionId === "string" ? req.body.sessionId.trim() : "";
    if (!text) {
      res.status(400).json({ error: { code: "INVALID_INPUT", message: "text is required" } });
      return;
    }
    if (!sessionId) {
      res.status(400).json({ error: { code: "INVALID_INPUT", message: "sessionId is required" } });
      return;
    }

    const agentId = resolveDispatchAgentId({ routeAgent });
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
