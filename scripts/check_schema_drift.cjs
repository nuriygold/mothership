// check_schema_drift.js
// Drift protection aligned to the active Mothership Drizzle schema/migrations.
//
// Source of truth:
//   1. artifacts/mothership/drizzle/mc/meta/_journal.json + sibling SQL files
//
// There is no silent fallback anymore. If active Drizzle migration history is
// missing, drift checks fail loudly so schema ownership cannot silently slide
// back to legacy SQL paths.
//
// Table declarations are read from the active application schema only:
//   artifacts/mothership/src/lib/db/schema.ts
//
// This intentionally ignores backup/legacy schema locations so the checker
// stops comparing the live database against stale migration history.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const postgres = require('postgres');

const ROOT = path.resolve(__dirname, '..');
const APP_ROOT = path.join(ROOT, 'artifacts', 'mothership');
const SUPABASE_MIGRATIONS_DIR = path.join(ROOT, 'supabase', 'migrations');
const DRIZZLE_MIGRATIONS_DIR = path.join(APP_ROOT, 'drizzle', 'mc');
const DRIZZLE_JOURNAL_PATH = path.join(DRIZZLE_MIGRATIONS_DIR, 'meta', '_journal.json');
const ACTIVE_SCHEMA_FILE = path.join(APP_ROOT, 'src', 'lib', 'db', 'schema.ts');

function firstNonEmpty(...values) {
  for (const value of values) {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (normalized) return normalized;
  }
  return undefined;
}

const DATABASE_URL = firstNonEmpty(
  process.env.SUPABASE_DATABASE_URL,
  process.env.POSTGRES_URL_NON_POOLING,
  process.env.POSTGRES_URL,
  process.env.DATABASE_MIGRATION_URL,
  process.env.DATABASE_URL,
  process.env.DATABASE_POOLER_URL,
  process.env.DATABASE_URL_POOLER_TRANS,
  process.env.DATABASE_URL_POOLER_SESSION,
);

if (!DATABASE_URL) {
  throw new Error(
    'Set SUPABASE_DATABASE_URL, POSTGRES_URL_NON_POOLING, POSTGRES_URL, DATABASE_MIGRATION_URL, or DATABASE_URL before running schema drift protection.'
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
    return entry.tag + '.sql';
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

function loadExpectedHashes() {
  if (!fs.existsSync(DRIZZLE_JOURNAL_PATH)) {
    const legacySupabaseMigrationsExist = fs.existsSync(SUPABASE_MIGRATIONS_DIR)
      && fs.readdirSync(SUPABASE_MIGRATIONS_DIR).some((name) => name.endsWith('.sql'));

    throw new Error(
      'Missing active Drizzle migration history at ' + path.relative(ROOT, DRIZZLE_JOURNAL_PATH) +
      '. Drift checks now require a real active migration journal for artifacts/mothership. ' +
      (legacySupabaseMigrationsExist
        ? 'Legacy supabase/migrations/*.sql exists, but it is not accepted as the active authority.'
        : 'No active migration history was found.')
    );
  }

  const journal = readJson(DRIZZLE_JOURNAL_PATH);
  const migrationFiles = migrationFilesFromJournal(journal);
  if (migrationFiles.length === 0) {
    throw new Error(
      'Active Drizzle migration journal exists but contains no entries: ' + path.relative(ROOT, DRIZZLE_JOURNAL_PATH)
    );
  }

  return migrationFiles.map((filename) => {
    const migrationPath = path.join(DRIZZLE_MIGRATIONS_DIR, filename);
    if (!fs.existsSync(migrationPath)) {
      throw new Error('Missing Drizzle migration file: ' + path.relative(ROOT, migrationPath));
    }
    return {
      source: 'drizzle',
      filename,
      hash: sha256(migrationPath),
    };
  });
}

function loadDeclaredTables() {
  if (!fs.existsSync(ACTIVE_SCHEMA_FILE)) {
    throw new Error('Missing active schema file: ' + path.relative(ROOT, ACTIVE_SCHEMA_FILE));
  }
  const source = fs.readFileSync(ACTIVE_SCHEMA_FILE, 'utf8');
  return [...tableNamesFromSchemaSource(source)].sort();
}

async function main() {
  const expectedHashes = loadExpectedHashes();
  const declaredTables = loadDeclaredTables();
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

    if (expectedHashes.length > 0) {
      if (migrationTable.length === 0) {
        issues.push(
          'Missing drizzle.__drizzle_migrations table for the active migration history. Run the current Mothership Drizzle migrations or switch the checker to a single SQL-based migration flow.'
        );
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
            'Migration count mismatch: expected ' + expectedAppliedHashes.length + ', found ' + appliedHashes.length
          );
        }

        for (let i = 0; i < Math.min(appliedHashes.length, expectedAppliedHashes.length); i += 1) {
          if (appliedHashes[i] !== expectedAppliedHashes[i]) {
            const expected = expectedHashes[i];
            issues.push(
              'Migration hash mismatch at position ' +
                (i + 1) +
                ' (' + expected.filename + '): expected ' + expected.hash + ', found ' + appliedHashes[i]
            );
          }
        }
      }
    }

    if (declaredTables.length > 0) {
      const liveTables = await sql`
        select table_name
        from information_schema.tables
        where table_schema = 'public'
          and table_name = any(${sql.array(declaredTables)})
      `;
      const liveTableSet = new Set(liveTables.map((row) => row.table_name));
      const missingTables = declaredTables.filter((tableName) => !liveTableSet.has(tableName));
      if (missingTables.length) {
        issues.push('Missing public tables declared by active schema: ' + missingTables.join(', '));
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

  console.log('Schema drift check passed (drizzle)');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});