import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';

async function main() {
  await db.execute(sql`select 1`);
  console.log('Drizzle seed bootstrap complete. Add inserts to drizzle/seed.ts as needed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
