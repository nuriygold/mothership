// check_schema_drift.js
// Generic schema drift protection for the Drizzle migration history and
// the live public schema in Supabase/Postgres.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const postgres = require('postgres');

const ROOT = path.resolve(__dirname, '..');
const MIGRATIONS_DIR = path.join(ROOT, 'drizzle', 'migrations');
const JOURNAL_PATH = path.join(MIGRATIONS_DIR, 'meta', '_journal.json');
const SCHEMA_FILES = [
  path.join(ROOT, 'lib', 'db', 'schema.ts'),
  path.join(ROOT, 'lib', 'db', 'dispatch-schema.ts'),
];

function firstNonEmpty(...values) {
  for (const value of values) {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (normalized) return normalized;
  }
  return undefined;
}

const DATABASE_URL = firstNonEmpty(
  process.env.SUPABASE_DATABASE_URL,
  process.env.DATABASE_URL,
  process.env.DATABASE_POOLER_URL,
  process.env.DATABASE_URL_POOLER_TRANS,
  process.env.DATABASE_URL_POOLER_SESSION,
  process.env.POSTGRES_URL_NON_POOLING,
  process.env.POSTGRES_URL,
  process.env.PRISMA_DATABASE_URL
);

if (!DATABASE_URL) {
  throw new Error(
    'Set SUPABASE_DATABASE_URL or DATABASE_URL before running schema drift protection.'
  );
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function migrationFilesFromJournal(journal) {
  return (journal.entries ?? []).map((entry) => {
    if (!entry?.tag) {
      throw new Error('Invalid drizzle journal entry without a tag.');
    }
    return `${entry.tag}.sql`;
  });
}

function tableNamesFromSchemaSource(source) {
  const names = new Set();
  const regex = /pgTable\(\s*['"]([^'"]+)['"]/g;
  let match;
  while ((match = regex.exec(source)) !== null) {
    names.add(match[1]);
  }
  return names;
}

async function main() {
  const journal = readJson(JOURNAL_PATH);
  const migrationFiles = migrationFilesFromJournal(journal);
  const expectedHashes = migrationFiles.map((filename) => {
    const migrationPath = path.join(MIGRATIONS_DIR, filename);
    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Missing migration file: drizzle/migrations/${filename}`);
    }
    return {
      filename,
      hash: sha256(migrationPath),
    };
  });

  const declaredTables = new Set();
  for (const schemaFile of SCHEMA_FILES) {
    const source = fs.readFileSync(schemaFile, 'utf8');
    for (const tableName of tableNamesFromSchemaSource(source)) {
      declaredTables.add(tableName);
    }
  }

  const issues = [];
  const sql = postgres(DATABASE_URL, {
    prepare: false,
    ssl: 'require',
  });

  try {
    const migrationTable = await sql`
      select table_schema, table_name
      from information_schema.tables
      where table_schema = 'drizzle' and table_name = '__drizzle_migrations'
      limit 1
    `;
    if (migrationTable.length === 0) {
      issues.push('Missing drizzle.__drizzle_migrations table');
    } else {
      const applied = await sql`
        select hash
        from drizzle.__drizzle_migrations
        order by id asc
      `;
      const appliedHashes = applied.map((row) => row.hash);
      const expectedAppliedHashes = expectedHashes.map((entry) => entry.hash);

      if (appliedHashes.length !== expectedAppliedHashes.length) {
        issues.push(
          `Migration count mismatch: expected ${expectedAppliedHashes.length}, found ${appliedHashes.length}`
        );
      }

      for (let i = 0; i < Math.min(appliedHashes.length, expectedAppliedHashes.length); i += 1) {
        if (appliedHashes[i] !== expectedAppliedHashes[i]) {
          issues.push(
            `Migration hash mismatch at position ${i + 1}: expected ${expectedAppliedHashes[i]}, found ${appliedHashes[i]}`
          );
        }
      }
    }

    const declaredTableList = [...declaredTables];
    if (declaredTableList.length) {
      const liveTables = await sql`
        select table_name
        from information_schema.tables
        where table_schema = 'public'
          and table_name = any(${sql.array(declaredTableList)})
      `;
      const liveTableSet = new Set(liveTables.map((row) => row.table_name));
      const missingTables = declaredTableList.filter((tableName) => !liveTableSet.has(tableName));
      if (missingTables.length) {
        issues.push(`Missing public tables: ${missingTables.join(', ')}`);
      }
    }
  } finally {
    await sql.end({ timeout: 0 });
  }

  if (issues.length) {
    console.error('Schema drift detected:', issues);
    process.exitCode = 1;
    return;
  }

  console.log('Schema drift check passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
