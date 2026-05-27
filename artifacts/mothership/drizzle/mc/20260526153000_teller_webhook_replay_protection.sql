create table if not exists "TellerWebhookReceipt" (
  "id" text primary key,
  "eventId" text,
  "signatureHash" text not null,
  "receivedAt" timestamptz not null default now(),
  "expiresAt" timestamptz not null
);

create index if not exists "TellerWebhookReceipt_eventId_idx"
  on "TellerWebhookReceipt" ("eventId");

create index if not exists "TellerWebhookReceipt_expiresAt_idx"
  on "TellerWebhookReceipt" ("expiresAt");

create unique index if not exists "TellerWebhookReceipt_signatureHash_key"
  on "TellerWebhookReceipt" ("signatureHash");
