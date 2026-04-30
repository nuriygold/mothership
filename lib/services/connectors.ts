import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import { desc } from 'drizzle-orm';

export async function listConnectors() {
  return db.query.connectors.findMany({
    orderBy: desc(schema.connectors.createdAt),
  });
}
