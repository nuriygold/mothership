create table if not exists "SystemLease" (
  "key" text primary key,
  "owner" text not null,
  "leaseUntil" timestamptz not null,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create index if not exists "SystemLease_leaseUntil_idx"
  on "SystemLease" ("leaseUntil");
