import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db';
import {
  mcArtifacts,
  type McArtifact,
  type McArtifactInsert,
} from '../../../db/dispatch-schema';
import { record } from './events';

export async function listArtifacts(campaignId: string): Promise<McArtifact[]> {
  return db
    .select()
    .from(mcArtifacts)
    .where(eq(mcArtifacts.campaignId, campaignId))
    .orderBy(desc(mcArtifacts.updatedAt));
}

export async function getArtifactByTitle(
  campaignId: string,
  title: string,
): Promise<McArtifact | undefined> {
  const rows = await db
    .select()
    .from(mcArtifacts)
    .where(and(eq(mcArtifacts.campaignId, campaignId), eq(mcArtifacts.title, title)))
    .limit(1);
  return rows[0];
}

export async function writeArtifact(input: McArtifactInsert): Promise<McArtifact> {
  const existing = await getArtifactByTitle(input.campaignId, input.title);
  if (existing) {
    const [updated] = await db
      .update(mcArtifacts)
      .set({
        artifactType: input.artifactType,
        description: input.description,
        pathOrUrl: input.pathOrUrl,
        contentSummary: input.contentSummary,
        contentHash: input.contentHash,
        producedByAgentId: input.producedByAgentId ?? existing.producedByAgentId,
        validationStatus: input.validationStatus ?? existing.validationStatus,
        currentVersion: existing.currentVersion + 1,
        updatedAt: new Date(),
        metadata: input.metadata ?? existing.metadata,
      })
      .where(eq(mcArtifacts.id, existing.id))
      .returning();
    await record(input.campaignId, 'artifact_updated', `Artifact updated: ${input.title}`, {
      artifactId: updated.id,
      title: updated.title,
      version: updated.currentVersion,
    });
    return updated;
  }

  const [row] = await db.insert(mcArtifacts).values(input).returning();
  await record(input.campaignId, 'artifact_created', `Artifact created: ${row.title}`, {
    artifactId: row.id,
    title: row.title,
    type: row.artifactType,
  });
  return row;
}
