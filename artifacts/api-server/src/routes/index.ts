import { Router, type IRouter, type Request, type Response } from "express";
import dispatchRouter from "./dispatch";
import agentRouter from "./agent";
import chatRouter from "./chat";
import healthRouter from "./health";
import opsRouter from "./ops";
import tellerRouter from "./teller";
import v2Router from "./v2";
import { checkGateway } from "@/lib/services/openclaw";
import { requireOwnerAuth } from "../lib/owner-auth";

const router: IRouter = Router();

function apiPath(req: Request) {
  return req.originalUrl.split("?")[0];
}

function sendApiRouteNotFound(res: Response, path: string) {
  res.status(404).json({
    error: {
      code: "API_ROUTE_NOT_FOUND",
      message: "No API route is mounted for this path.",
      path,
    },
  });
}

function sendApiRouteNotImplemented(
  res: Response,
  path: string,
  code: string,
  message: string,
) {
  res.status(501).json({
    error: {
      code,
      message,
      path,
    },
  });
}

function isProtectedAgentRoute(path: string) {
  return (
    path === "/agent" ||
    path.startsWith("/chat") ||
    /^\/v2\/(ruby|adrian|emerald|adobe|anchor)(?:\/|$)/.test(path)
  );
}

router.use((req: Request, res: Response, next) => {
  void (async () => {
    if (!isProtectedAgentRoute(req.path)) {
      next();
      return;
    }

    if (!(await requireOwnerAuth(req, res))) {
      return;
    }

    next();
  })().catch((err: unknown) => {
    next(err);
  });
});

router.use(healthRouter);
router.use(dispatchRouter);
router.use(opsRouter);
router.use(tellerRouter);
router.use(chatRouter);
router.use(agentRouter);
router.use(v2Router);

router.get("/openclaw/health", async (req: Request, res: Response) => {
  const gateway = await checkGateway();
  if (gateway.ok) {
    res.json({ ok: true, status: "ok", path: apiPath(req), reason: gateway.reason });
    return;
  }

  res.status(501).json({
    error: {
      code: "OPENCLAW_HEALTH_NOT_CONFIGURED",
      message: gateway.reason,
      path: apiPath(req),
    },
  });
});

router.use((req: Request, res: Response) => {
  sendApiRouteNotFound(res, apiPath(req));
});

export default router;
