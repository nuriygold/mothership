#!/bin/bash
# cron_dispatch_task_schema_check.sh
cd "$(dirname "$0")/.."
export NODE_ENV=production
export SUPABASE_DATABASE_URL="postgresql://postgres:4!July311988!!!!@db.ejmkliupmkqmougvkpai.supabase.co:5432/postgres"

node ./scripts/check_dispatch_task_schema.js >> ./logs/schema_check.log 2>&1
