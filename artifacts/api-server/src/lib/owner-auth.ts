import { eq } from "drizzle-orm";
import type { Request, Response } from "express";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";

function apiPath(req: Request) {
  return req.originalUrl.split("?")[0];
}

function sendUnauthorized(req: Request, res: Response) {
  res.status(401).json({
    error: {
      code: "UNAUTHORIZED",
      message: "Owner authentication required.",
      path: apiPath(req),
    },
  });
}

export async function requireOwnerAuth(req: Request, res: Response) {
  const ownerId = String(req.cookies?.["mothership-owner-id"] ?? "").trim();
  if (!ownerId) {
    sendUnauthorized(req, res);
    return false;
  }

  const [exists] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, ownerId))
    .limit(1);

  if (!exists?.id) {
    sendUnauthorized(req, res);
    return false;
  }

  return true;
}
