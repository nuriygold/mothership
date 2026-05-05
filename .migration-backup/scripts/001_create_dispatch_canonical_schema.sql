-- ============================================================================
-- Dispatch canonical schema (Gateway / Builder / Supabase contract)
-- ----------------------------------------------------------------------------
-- Source of truth: the 13-table design in docs/dispatch-schema.md.
-- This file is idempotent — safe to re-run.
--
-- Naming: snake_case lowercase table names (distinct from the existing
-- PascalCase legacy tables like "Approval", "DispatchCampaign", "Workflow",
-- which are quoted identifiers and are NOT touched by this migration).
-- ============================================================================

create extension if not exists "pgcrypto";

-- ── 1. agents ───────────────────────────────────────────────────────────────
create table if not exists public.agents (
  id           uuid        primary key default gen_random_uuid(),
  name         text        not null,
  codename     text,
  role         text,
  runtime_key  text,
  capabilities jsonb       not null default '[]'::jsonb,
  status       text        not null default 'active',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  metadata     jsonb       not null default '{}'::jsonb,
  constraint agents_status_chk
    check (status in ('active','inactive','unavailable','deprecated'))
);

create index if not exists agents_status_idx     on public.agents (status);
create index if not exists agents_runtime_key_idx on public.agents (runtime_key);

-- ── 2. campaigns ────────────────────────────────────────────────────────────
create table if not exists public.campaigns (
  id                uuid        primary key default gen_random_uuid(),
  name              text        not null,
  description       text,
  campaign_type     text        not null,
  status            text        not null default 'draft',
  priority          text,
  objective         text,
  success_criteria  jsonb       not null default '{}'::jsonb,
  progress_mode     text        not null default 'mixed',
  progress_summary  jsonb       not null default '{}'::jsonb,
  owner_id          uuid,
  created_by        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  started_at        timestamptz,
  completed_at      timestamptz,
  due_at            timestamptz,
  metadata          jsonb       not null default '{}'::jsonb,
  constraint campaigns_type_chk check (campaign_type in (
    'data_operation','content_pipeline','task_orchestration',
    'product_development','research','finance_audit',
    'document_processing','integration_workflow','general_execution'
  )),
  constraint campaigns_status_chk check (status in (
    'draft','approved','queued','running','waiting_for_approval',
    'blocked','paused','completed','failed','archived'
  )),
  constraint campaigns_progress_mode_chk check (progress_mode in (
    'work_item_completion','artifact_completion','event_milestone',
    'checklist','manual_status','external_signal','mixed'
  )),
  constraint campaigns_priority_chk check (
    priority is null or priority in ('low','medium','high','critical')
  )
);

create index if not exists campaigns_status_idx        on public.campaigns (status);
create index if not exists campaigns_campaign_type_idx on public.campaigns (campaign_type);
create index if not exists campaigns_priority_idx      on public.campaigns (priority);
create index if not exists campaigns_created_at_idx    on public.campaigns (created_at desc);
create index if not exists campaigns_owner_id_idx      on public.campaigns (owner_id);

-- ── 3. campaign_agents (M:N campaigns ↔ agents) ─────────────────────────────
create table if not exists public.campaign_agents (
  id              uuid        primary key default gen_random_uuid(),
  campaign_id     uuid        not null references public.campaigns(id) on delete cascade,
  agent_id        uuid        not null references public.agents(id)    on delete cascade,
  assignment_role text        not null default 'executor',
  is_primary      boolean     not null default false,
  assigned_at     timestamptz not null default now(),
  metadata        jsonb       not null default '{}'::jsonb,
  constraint campaign_agents_role_chk check (assignment_role in (
    'owner','executor','reviewer','validator','supervisor','fallback','observer'
  )),
  constraint campaign_agents_unique unique (campaign_id, agent_id, assignment_role)
);

create index if not exists campaign_agents_campaign_idx on public.campaign_agents (campaign_id);
create index if not exists campaign_agents_agent_idx    on public.campaign_agents (agent_id);

-- ── 4. approvals (created before work_items/artifacts so they can FK into it) ─
create table if not exists public.approvals (
  id                     uuid        primary key default gen_random_uuid(),
  campaign_id            uuid        not null references public.campaigns(id) on delete cascade,
  work_item_id           uuid,                              -- FK added below (circular)
  requested_by_agent_id  uuid        references public.agents(id) on delete set null,
  approval_type          text        not null,
  risk_level             text        not null,
  requested_action       text        not null,
  reason                 text,
  status                 text        not null default 'pending',
  approved_by            text,
  rejected_by            text,
  decision_notes         text,
  expires_at             timestamptz,
  created_at             timestamptz not null default now(),
  decided_at             timestamptz,
  metadata               jsonb       not null default '{}'::jsonb,
  constraint approvals_type_chk check (approval_type in (
    'external_post','purchase','deletion','financial_action',
    'customer_contact','public_content','database_mutation',
    'file_overwrite','sensitive_data_use','generic_risk'
  )),
  constraint approvals_status_chk check (status in (
    'pending','approved','rejected','expired','cancelled'
  )),
  constraint approvals_risk_chk check (risk_level in (
    'low','medium','high','critical'
  ))
);

create index if not exists approvals_campaign_idx on public.approvals (campaign_id);
create index if not exists approvals_status_idx   on public.approvals (status);
create index if not exists approvals_work_item_idx on public.approvals (work_item_id);

-- ── 5. campaign_work_items ──────────────────────────────────────────────────
create table if not exists public.campaign_work_items (
  id                     uuid        primary key default gen_random_uuid(),
  campaign_id            uuid        not null references public.campaigns(id) on delete cascade,
  parent_work_item_id    uuid        references public.campaign_work_items(id) on delete cascade,
  title                  text        not null,
  description            text,
  status                 text        not null default 'pending',
  sequence_order         integer,
  assigned_agent_id      uuid        references public.agents(id) on delete set null,
  dependencies           jsonb       not null default '[]'::jsonb,
  expected_artifact_type text,
  risk_level             text        not null default 'low',
  approval_required      boolean     not null default false,
  approval_id            uuid        references public.approvals(id) on delete set null,
  started_at             timestamptz,
  completed_at           timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  metadata               jsonb       not null default '{}'::jsonb,
  constraint work_items_status_chk check (status in (
    'pending','queued','running','waiting_for_approval','blocked',
    'completed','failed','skipped','cancelled'
  )),
  constraint work_items_risk_chk check (risk_level in (
    'low','medium','high','critical'
  ))
);

create index if not exists work_items_campaign_idx        on public.campaign_work_items (campaign_id);
create index if not exists work_items_status_idx          on public.campaign_work_items (status);
create index if not exists work_items_parent_idx          on public.campaign_work_items (parent_work_item_id);
create index if not exists work_items_assigned_agent_idx  on public.campaign_work_items (assigned_agent_id);
create index if not exists work_items_campaign_seq_idx    on public.campaign_work_items (campaign_id, sequence_order);

-- Close the circular FK between approvals.work_item_id ↔ campaign_work_items.id
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'approvals_work_item_id_fkey'
  ) then
    alter table public.approvals
      add constraint approvals_work_item_id_fkey
      foreign key (work_item_id)
      references public.campaign_work_items(id)
      on delete set null;
  end if;
end $$;

-- ── 6. artifacts ────────────────────────────────────────────────────────────
create table if not exists public.artifacts (
  id                    uuid        primary key default gen_random_uuid(),
  campaign_id           uuid        not null references public.campaigns(id) on delete cascade,
  work_item_id          uuid        references public.campaign_work_items(id) on delete set null,
  artifact_type         text        not null,
  title                 text        not null,
  description           text,
  path_or_url           text,
  storage_provider      text,
  content_summary       text,
  content_hash          text,
  produced_by_agent_id  uuid        references public.agents(id) on delete set null,
  validation_status     text        not null default 'unvalidated',
  current_version       integer     not null default 1,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  metadata              jsonb       not null default '{}'::jsonb,
  constraint artifacts_type_chk check (artifact_type in (
    'markdown','document','spreadsheet','image','video','dataset',
    'source','audit_record','task_list','code','external_link',
    'note','log','other'
  )),
  constraint artifacts_validation_chk check (validation_status in (
    'unvalidated','valid','invalid','stale','incomplete','needs_review'
  ))
);

create index if not exists artifacts_campaign_idx          on public.artifacts (campaign_id);
create index if not exists artifacts_work_item_idx         on public.artifacts (work_item_id);
create index if not exists artifacts_validation_status_idx on public.artifacts (validation_status);
create index if not exists artifacts_type_idx              on public.artifacts (artifact_type);

-- ── 7. artifact_validations (history of validation runs) ────────────────────
create table if not exists public.artifact_validations (
  id                  uuid        primary key default gen_random_uuid(),
  artifact_id         uuid        not null references public.artifacts(id) on delete cascade,
  campaign_id         uuid        not null references public.campaigns(id) on delete cascade,
  work_item_id        uuid        references public.campaign_work_items(id) on delete set null,
  validator_agent_id  uuid        references public.agents(id) on delete set null,
  validation_status   text        not null,
  validation_notes    text,
  validation_evidence jsonb       not null default '{}'::jsonb,
  checked_at          timestamptz not null default now(),
  metadata            jsonb       not null default '{}'::jsonb,
  constraint artifact_validations_status_chk check (validation_status in (
    'unvalidated','valid','invalid','stale','incomplete','needs_review'
  ))
);

create index if not exists artifact_validations_artifact_idx  on public.artifact_validations (artifact_id);
create index if not exists artifact_validations_campaign_idx  on public.artifact_validations (campaign_id);
create index if not exists artifact_validations_checked_at_idx on public.artifact_validations (checked_at desc);

-- ── 8. campaign_events (append-only log) ────────────────────────────────────
create table if not exists public.campaign_events (
  id           uuid        primary key default gen_random_uuid(),
  campaign_id  uuid        not null references public.campaigns(id) on delete cascade,
  work_item_id uuid        references public.campaign_work_items(id) on delete set null,
  agent_id     uuid        references public.agents(id) on delete set null,
  event_type   text        not null,
  message      text,
  payload      jsonb       not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  constraint campaign_events_type_chk check (event_type in (
    'campaign_created','campaign_updated','campaign_approved','campaign_queued',
    'campaign_started','campaign_paused','campaign_resumed','campaign_cancelled',
    'campaign_completed','campaign_failed','agent_assigned',
    'work_item_created','work_item_started','work_item_completed',
    'artifact_created','artifact_updated','artifact_validated',
    'blocker_created','blocker_resolved',
    'approval_requested','approval_granted','approval_rejected',
    'execution_started','execution_progress','execution_resumed','execution_failed',
    'watchdog_stall_detected','resume_directive_created'
  ))
);

create index if not exists campaign_events_campaign_idx    on public.campaign_events (campaign_id);
create index if not exists campaign_events_created_at_idx  on public.campaign_events (created_at desc);
create index if not exists campaign_events_event_type_idx  on public.campaign_events (event_type);
create index if not exists campaign_events_campaign_created_idx
  on public.campaign_events (campaign_id, created_at desc);

-- ── 9. blockers ─────────────────────────────────────────────────────────────
create table if not exists public.blockers (
  id                       uuid        primary key default gen_random_uuid(),
  campaign_id              uuid        not null references public.campaigns(id) on delete cascade,
  work_item_id             uuid        references public.campaign_work_items(id) on delete set null,
  created_by_agent_id      uuid        references public.agents(id) on delete set null,
  summary                  text        not null,
  details                  text,
  severity                 text        not null default 'medium',
  status                   text        not null default 'open',
  attempted_method         text,
  failure_evidence         jsonb       not null default '{}'::jsonb,
  fallback_attempts        jsonb       not null default '[]'::jsonb,
  required_resolution      text,
  resolver_type            text,
  resolver_id              text,
  can_continue_elsewhere   boolean     not null default false,
  created_at               timestamptz not null default now(),
  resolved_at              timestamptz,
  metadata                 jsonb       not null default '{}'::jsonb,
  constraint blockers_status_chk check (status in (
    'open','in_review','resolved','dismissed','stale'
  )),
  constraint blockers_severity_chk check (severity in (
    'low','medium','high','critical'
  )),
  constraint blockers_resolver_chk check (
    resolver_type is null or resolver_type in (
      'user','agent','builder','gateway','external_system','unknown'
    )
  )
);

create index if not exists blockers_campaign_idx on public.blockers (campaign_id);
create index if not exists blockers_status_idx   on public.blockers (status);
create index if not exists blockers_severity_idx on public.blockers (severity);

-- ── 10. execution_attempts ──────────────────────────────────────────────────
create table if not exists public.execution_attempts (
  id               uuid        primary key default gen_random_uuid(),
  campaign_id      uuid        not null references public.campaigns(id) on delete cascade,
  work_item_id     uuid        references public.campaign_work_items(id) on delete set null,
  agent_id         uuid        references public.agents(id) on delete set null,
  gateway_run_id   text,
  attempt_number   integer     not null,
  status           text        not null default 'started',
  execution_mode   text,
  started_at       timestamptz not null default now(),
  completed_at     timestamptz,
  input_payload    jsonb       not null default '{}'::jsonb,
  output_payload   jsonb       not null default '{}'::jsonb,
  error_message    text,
  fallback_used    boolean     not null default false,
  fallback_details jsonb       not null default '{}'::jsonb,
  metadata         jsonb       not null default '{}'::jsonb,
  constraint execution_attempts_status_chk check (status in (
    'started','running','succeeded','failed','stalled','cancelled','resumed'
  )),
  constraint execution_attempts_mode_chk check (
    execution_mode is null or execution_mode in (
      'api','cli','browser','file_operation','database',
      'manual_approval','agent_handoff','mixed'
    )
  )
);

create index if not exists execution_attempts_campaign_idx   on public.execution_attempts (campaign_id);
create index if not exists execution_attempts_status_idx     on public.execution_attempts (status);
create index if not exists execution_attempts_work_item_idx  on public.execution_attempts (work_item_id);
create index if not exists execution_attempts_gateway_run_idx on public.execution_attempts (gateway_run_id);

-- ── 11. resume_directives ───────────────────────────────────────────────────
create table if not exists public.resume_directives (
  id                       uuid        primary key default gen_random_uuid(),
  campaign_id              uuid        not null references public.campaigns(id) on delete cascade,
  work_item_id             uuid        references public.campaign_work_items(id) on delete set null,
  created_by               text,
  recommended_agent_id     uuid        references public.agents(id) on delete set null,
  stall_reason             text,
  last_valid_event_id      uuid        references public.campaign_events(id) on delete set null,
  next_executable_action   text        not null,
  required_artifact_type   text,
  required_validation      text,
  fallback_method          text,
  approval_required        boolean     not null default false,
  status                   text        not null default 'open',
  created_at               timestamptz not null default now(),
  consumed_at              timestamptz,
  metadata                 jsonb       not null default '{}'::jsonb,
  constraint resume_directives_status_chk check (status in (
    'open','consumed','superseded','dismissed','completed'
  ))
);

create index if not exists resume_directives_campaign_idx on public.resume_directives (campaign_id);
create index if not exists resume_directives_status_idx   on public.resume_directives (status);

-- ── 12. campaign_sources ────────────────────────────────────────────────────
create table if not exists public.campaign_sources (
  id           uuid        primary key default gen_random_uuid(),
  campaign_id  uuid        not null references public.campaigns(id) on delete cascade,
  source_type  text        not null,
  title        text,
  path_or_url  text,
  description  text,
  added_by     text,
  created_at   timestamptz not null default now(),
  metadata     jsonb       not null default '{}'::jsonb,
  constraint campaign_sources_type_chk check (source_type in (
    'document','url','file','dataset','repository','screenshot',
    'email','calendar','database_record','external_system',
    'manual_note','other'
  ))
);

create index if not exists campaign_sources_campaign_idx on public.campaign_sources (campaign_id);
create index if not exists campaign_sources_type_idx     on public.campaign_sources (source_type);

-- ── 13. campaign_tags ───────────────────────────────────────────────────────
create table if not exists public.campaign_tags (
  id            uuid        primary key default gen_random_uuid(),
  campaign_id   uuid        references public.campaigns(id) on delete cascade,
  work_item_id  uuid        references public.campaign_work_items(id) on delete cascade,
  artifact_id   uuid        references public.artifacts(id) on delete cascade,
  tag           text        not null,
  created_at    timestamptz not null default now(),
  constraint campaign_tags_at_least_one_target_chk check (
    campaign_id is not null
    or work_item_id is not null
    or artifact_id is not null
  )
);

create index if not exists campaign_tags_tag_idx          on public.campaign_tags (tag);
create index if not exists campaign_tags_campaign_idx     on public.campaign_tags (campaign_id);
create index if not exists campaign_tags_work_item_idx    on public.campaign_tags (work_item_id);
create index if not exists campaign_tags_artifact_idx     on public.campaign_tags (artifact_id);

-- ============================================================================
-- updated_at triggers
-- ============================================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'agents',
    'campaigns',
    'campaign_work_items',
    'artifacts'
  ]
  loop
    execute format($f$
      drop trigger if exists %I_set_updated_at on public.%I;
      create trigger %I_set_updated_at
        before update on public.%I
        for each row execute function public.set_updated_at();
    $f$, t, t, t, t);
  end loop;
end $$;

-- ============================================================================
-- Row Level Security
-- ----------------------------------------------------------------------------
-- Strategy:
--   • Enable RLS on every table.
--   • Allow service_role full access (Gateway runtime + server-side Builder).
--   • Allow authenticated users to read/write campaigns they own
--     (campaigns.owner_id = auth.uid()) and all rows that descend from
--     a campaign they own.
--   • Approvals decisions are gated to authenticated users only — no anon,
--     no public client — matching "Do not rely on client-only enforcement
--     for approvals or risky state transitions."
--
-- These are starter policies. Tighten them per role (reviewer-only,
-- validator-only, etc.) as the Builder role model evolves.
-- ============================================================================
alter table public.agents               enable row level security;
alter table public.campaigns            enable row level security;
alter table public.campaign_agents      enable row level security;
alter table public.campaign_work_items  enable row level security;
alter table public.approvals            enable row level security;
alter table public.artifacts            enable row level security;
alter table public.artifact_validations enable row level security;
alter table public.campaign_events      enable row level security;
alter table public.blockers             enable row level security;
alter table public.execution_attempts   enable row level security;
alter table public.resume_directives    enable row level security;
alter table public.campaign_sources     enable row level security;
alter table public.campaign_tags        enable row level security;

-- Service role has full access on every table (Gateway runtime + server APIs).
do $$
declare
  t text;
begin
  foreach t in array array[
    'agents','campaigns','campaign_agents','campaign_work_items',
    'approvals','artifacts','artifact_validations','campaign_events',
    'blockers','execution_attempts','resume_directives',
    'campaign_sources','campaign_tags'
  ]
  loop
    execute format($f$
      drop policy if exists %I_service_role_all on public.%I;
      create policy %I_service_role_all on public.%I
        for all
        to service_role
        using (true)
        with check (true);
    $f$, t, t, t, t);
  end loop;
end $$;

-- Authenticated reads on agents (reference data — visible to all signed-in users).
drop policy if exists agents_authenticated_select on public.agents;
create policy agents_authenticated_select on public.agents
  for select
  to authenticated
  using (true);

-- Campaigns: owner can read/write their own.
drop policy if exists campaigns_owner_all on public.campaigns;
create policy campaigns_owner_all on public.campaigns
  for all
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Helper: rows that reference a campaign the caller owns.
-- Applied uniformly to every campaign-scoped table.
do $$
declare
  t text;
begin
  foreach t in array array[
    'campaign_agents','campaign_work_items','approvals','artifacts',
    'artifact_validations','campaign_events','blockers',
    'execution_attempts','resume_directives','campaign_sources','campaign_tags'
  ]
  loop
    execute format($f$
      drop policy if exists %I_owner_select on public.%I;
      create policy %I_owner_select on public.%I
        for select
        to authenticated
        using (
          campaign_id is null
          or exists (
            select 1 from public.campaigns c
            where c.id = %I.campaign_id
              and c.owner_id = auth.uid()
          )
        );
    $f$, t, t, t, t, t);
  end loop;
end $$;

-- ============================================================================
-- Done. Re-run any time — IF NOT EXISTS / DROP-CREATE patterns make this safe.
-- ============================================================================
