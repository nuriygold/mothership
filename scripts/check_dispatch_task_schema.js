// check_dispatch_task_schema.js
// Permanent schema drift protection for DispatchTask (Supabase/Postgres)

const { Client } = require('pg');

const REQUIRED_COLUMNS = {
  key: 'text',
  dependencies: 'jsonb',
  toolRequirements: 'jsonb',
  taskPoolIssueUrl: 'text',
  agentId: 'text',
  output: 'text',
  reviewOutput: 'text',
  errorMessage: 'text',
  toolTurns: 'integer',
  taskPoolIssueNumber: 'integer',
};

const DATABASE_URL = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL || 'postgresql://postgres:4!July311988!!!!@db.ejmkliupmkqmougvkpai.supabase.co:5432/postgres';

async function checkColumns() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  let issues = [];

  for (const [col, type] of Object.entries(REQUIRED_COLUMNS)) {
    const res = await client.query(
      `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'DispatchTask' and column_name = $1`,
      [col]
    );
    if (res.rows.length === 0) {
      issues.push(`MISSING: ${col}`);
      // Auto-fix: Add column
      await client.query(`ALTER TABLE "DispatchTask" ADD COLUMN IF NOT EXISTS "${col}" ${type}`);
    } else if (res.rows[0].data_type !== (type === 'jsonb' ? 'jsonb' : type === 'integer' ? 'integer' : 'text')) {
      issues.push(`TYPE DRIFT: ${col} expected ${type}, found ${res.rows[0].data_type}`);
      // Could also alter type; caution if incompatible.
    }
  }

  await client.end();

  if (issues.length) {
    console.error('DispatchTask schema drift detected/resolved:', issues);
    process.exitCode = 1;
  } else {
    console.log('DispatchTask schema OK');
  }
}

checkColumns();
