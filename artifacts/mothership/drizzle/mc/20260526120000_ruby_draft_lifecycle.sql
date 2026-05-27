create table if not exists "RubyDraftLifecycle" (
  "id" text primary key,
  "emailExternalId" text not null unique,
  "status" text not null default 'idle',
  "generationOwner" text,
  "generationLeaseUntil" timestamptz,
  "lastGeneratedDraftId" text,
  "finalizedAt" timestamptz,
  "failureReason" text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null
);

create index if not exists "RubyDraftLifecycle_status_updatedAt_idx"
  on "RubyDraftLifecycle" ("status", "updatedAt");

alter table "DispatchCampaign"
  add column if not exists "workerRunOwner" text,
  add column if not exists "workerRunLeaseUntil" timestamptz,
  add column if not exists "artifactsWrittenAt" timestamptz,
  add column if not exists "completionNotifiedAt" timestamptz,
  add column if not exists "callbackDeliveredAt" timestamptz;
