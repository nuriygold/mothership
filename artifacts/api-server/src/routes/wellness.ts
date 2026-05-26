import { Router, type IRouter, type Request, type Response } from "express";
import { desc, eq } from "drizzle-orm";
import { db, wellnessLogs } from "@/lib/db";
import { logger } from "../lib/logger";

const router: IRouter = Router();

type WellnessPayload = {
  date?: unknown;
  water?: unknown;
  steps?: unknown;
  workout?: unknown;
  prayer?: unknown;
  journal?: unknown;
  vitamins?: unknown;
};

const wrap = (
  fn: (req: Request, res: Response) => Promise<unknown>,
) => (req: Request, res: Response) => {
  fn(req, res).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, path: req.path }, "wellness route failed");
    res.status(500).json({ message });
  });
};

function normalizeDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

function parseIntField(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (rounded < min || rounded > max) return null;
  return rounded;
}

function parseBoolField(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function toResponse(row: typeof wellnessLogs.$inferSelect) {
  return {
    date: row.date,
    water: row.water,
    steps: row.steps,
    workout: row.workout,
    prayer: row.prayer,
    journal: row.journal,
    vitamins: row.vitamins,
    updated_at: row.updatedAt.toISOString(),
  };
}

router.get("/", wrap(async (req, res) => {
  if (typeof req.query.date !== "undefined") {
    const date = normalizeDate(req.query.date);
    if (!date) {
      res.status(400).json({ error: { code: "INVALID_INPUT", message: "date must be YYYY-MM-DD" } });
      return;
    }
    const row = await db.query.wellnessLogs.findFirst({ where: eq(wellnessLogs.date, date) });
    res.json({ log: row ? toResponse(row) : null });
    return;
  }
  const logs = await db.select().from(wellnessLogs).orderBy(desc(wellnessLogs.date)).limit(14);
  res.json({ logs: logs.map(toResponse) });
}));

router.put("/", wrap(async (req, res) => {
  const body = (req.body ?? {}) as WellnessPayload;
  const date = normalizeDate(body.date);
  const water = parseIntField(body.water, 0, 8);
  const steps = parseIntField(body.steps, 0, 10);
  const workout = parseBoolField(body.workout);
  const prayer = parseBoolField(body.prayer);
  const journal = parseBoolField(body.journal);
  const vitamins = parseBoolField(body.vitamins);
  if (!date || water === null || steps === null || workout === null || prayer === null || journal === null || vitamins === null) {
    res.status(400).json({ error: { code: "INVALID_INPUT", message: "body must include date (YYYY-MM-DD), water (0-8), steps (0-10), and boolean workout/prayer/journal/vitamins fields" } });
    return;
  }
  const record = { date, water, steps, workout, prayer, journal, vitamins, updatedAt: new Date() };
  await db.insert(wellnessLogs).values(record).onConflictDoUpdate({
    target: wellnessLogs.date,
    set: { water: record.water, steps: record.steps, workout: record.workout, prayer: record.prayer, journal: record.journal, vitamins: record.vitamins, updatedAt: record.updatedAt },
  });
  const saved = await db.query.wellnessLogs.findFirst({ where: eq(wellnessLogs.date, date) });
  res.json({ log: saved ? toResponse(saved) : null });
}));

export default router;
