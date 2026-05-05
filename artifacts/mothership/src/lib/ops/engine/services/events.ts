import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db';
import {
  mcEvents,
  type EventType,
  type McEvent,
  type McEventInsert,
} from '../../../db/dispatch-schema';
import type { JsonValue } from '../../../db/json';

export async function appendEvent(input: McEventInsert): Promise<McEvent> {
  const [row] = await db.insert(mcEvents).values(input).returning();
  return row;
}

export async function listEvents(
  campaignId: string,
  limit = 200,
): Promise<McEvent[]> {
  return db
    .select()
    .from(mcEvents)
    .where(eq(mcEvents.campaignId, campaignId))
    .orderBy(desc(mcEvents.createdAt))
    .limit(limit);
}

export async function record(
  campaignId: string,
  eventType: EventType,
  message: string,
  payload: JsonValue = {},
): Promise<McEvent> {
  return appendEvent({ campaignId, eventType, message, payload });
}

export async function listEventsByType(
  campaignId: string,
  eventType: EventType,
): Promise<McEvent[]> {
  return db
    .select()
    .from(mcEvents)
    .where(and(eq(mcEvents.campaignId, campaignId), eq(mcEvents.eventType, eventType)))
    .orderBy(desc(mcEvents.createdAt));
}
