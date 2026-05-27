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
