# Mothership Launch Checklist

Use this step-by-step guide for staging/prod launch. Prod stays unseeded; staging may be seeded.

## 1) Secrets
- Set `DATABASE_URL` (Supabase service-role, schema=public, SSL required) in your host secrets (e.g., Vercel). Do **not** commit it.
- Optional, keep unset if not in use yet:
  - `TELEGRAM_BOT_TOKEN` (command/approval surface)
  - `GITHUB_TOKEN` (future task sync)

## 2) Database posture
- Prod Supabase: ensure empty data except schema; do **not** seed.
- Staging: point `DATABASE_URL` to staging DB and, if desired, run `npm run db:seed:staging`.

## 3) Deploy
- Push latest code.
- In prod env: `npm run migrate:deploy` (applies Prisma migrations). Avoid `migrate dev` in prod.
- Start app: `npm run start` (hosted) or `npm run dev` locally for verification.

## 4) Smoke test (prod or staging)
- Visit `/dashboard`, `/tasks`, `/workflows`, `/runs`, `/activity`, `/command-center`.
- Expect clean empty states and no errors.

## 5) Ops notes
- Health probe: `/dashboard` is a suitable endpoint.
- Rollback: keep previous deploy; since prod isn’t seeded, rollback is code-only.

## Test Plan
- `npm run migrate:deploy` succeeds against prod DB.
- (Staging) `npm run db:seed:staging` completes.
- All core routes load without runtime errors on deployed build.

## Assumptions
- Prod and staging Supabase instances are separate.
- Service-role key is stored only in host secrets; anon key not yet required.
- RLS/auth will be added later; schema remains in `public`.
