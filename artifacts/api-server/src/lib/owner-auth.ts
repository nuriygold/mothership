import type { Request, Response } from "express";
import { OWNER_COOKIE, verifyOwnerCookieValue } from "@/lib/auth/owner-cookie";

function apiPath(req: Request) {
  return req.originalUrl.split("?")[0];
}

function unauthorizedMessage(reason: string) {
  switch (reason) {
    case "expired":
      return "Owner session expired.";
    case "misconfigured":
      return "Owner authentication is not configured.";
    default:
      return "Owner authentication required.";
  }
}

export function sendUnauthorized(req: Request, res: Response, reason = "missing") {
  res.status(401).json({
    error: {
      code: "UNAUTHORIZED",
      message: unauthorizedMessage(reason),
      path: apiPath(req),
    },
  });
}

export async function requireOwnerAuth(req: Request, res: Response) {
  const verification = verifyOwnerCookieValue(req.cookies?.[OWNER_COOKIE]);
  if (!verification.ok) {
    sendUnauthorized(req, res, verification.reason);
    return false;
  }

  return true;
}
