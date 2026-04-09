#!/usr/bin/env bash
set -e

# Navigate to repo
cd /Users/claw/openclaw/mothership

# Ensure migrations folder exists
mkdir -p prisma/migrations

# Generate SQL diff between current DB and schema
npx prisma migrate diff \
  --from-url "$DATABASE_URL" \
  --to-schema-datamodel prisma/schema.prisma \
  --script > prisma/migrations/finance_primitives.sql

# Apply migration
npx prisma db execute \
  --file prisma/migrations/finance_primitives.sql \
  --schema prisma/schema.prisma

# Commit and push branch
 git add .
 git commit -m "Finance system refactor: introduce Account, Transaction, and Payable models" || echo "Nothing to commit"
 git push origin finance/primitives-refactor

# Create PR
 gh pr create \
  --title "Finance System Refactor - Introduce Accounts, Transactions, and Payables" \
  --body "Implements financial primitives (Account, Transaction, Payable), removes task-derived financial logic, and stabilizes the Finance overview API." \
  --base main \
  --head finance/primitives-refactor
