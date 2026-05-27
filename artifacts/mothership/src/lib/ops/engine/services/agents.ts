import { eq } from 'drizzle-orm';
import { db } from '../db';
import { mcAgents, type McAgent, type McAgentInsert } from '../../../db/dispatch-schema';

export async function listAgents(): Promise<McAgent[]> {
  return db.select().from(mcAgents).orderBy(mcAgents.name);
}

export async function getAgent(id: string): Promise<McAgent | undefined> {
  const rows = await db.select().from(mcAgents).where(eq(mcAgents.id, id)).limit(1);
  return rows[0];
}

export async function getAgentByCodename(codename: string): Promise<McAgent | undefined> {
  const rows = await db.select().from(mcAgents).where(eq(mcAgents.codename, codename)).limit(1);
  return rows[0];
}

export async function upsertAgent(input: McAgentInsert): Promise<McAgent> {
  if (input.codename) {
    const existingRows = await db
      .select()
      .from(mcAgents)
      .where(eq(mcAgents.codename, input.codename));

    if (existingRows.length > 0) {
      const existing = existingRows[0];
      const [updated] = await db
        .update(mcAgents)
        .set({
          name: input.name,
          role: input.role,
          runtimeKey: input.runtimeKey,
          capabilities: input.capabilities ?? existing.capabilities,
          status: input.status ?? existing.status,
          updatedAt: new Date(),
          metadata: input.metadata ?? existing.metadata,
        })
        .where(eq(mcAgents.codename, input.codename))
        .returning();
      return updated;
    }
  }
  const [row] = await db.insert(mcAgents).values(input).returning();
  return row;
}
