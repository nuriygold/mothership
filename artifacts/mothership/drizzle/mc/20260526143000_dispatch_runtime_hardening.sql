alter table "DispatchCampaign"
  add column if not exists "workerRunOwner" text,
  add column if not exists "workerRunLeaseUntil" timestamptz,
  add column if not exists "artifactsWrittenAt" timestamptz,
  add column if not exists "completionNotifiedAt" timestamptz,
  add column if not exists "callbackDeliveredAt" timestamptz;
