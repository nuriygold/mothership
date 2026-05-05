-- =============================================================================
-- Dispatch / Mission Control canonical schema (v1)
-- =============================================================================
-- Generic agent-orchestrated campaign data model. Supports Shopify, content,
-- product, life-admin, research, finance, document, and general task domains.
--
-- This script is idempotent: every table uses IF NOT EXISTS, every index uses
-- IF NOT EXISTS, every constraint is added with a guarded DO block.
-- Safe to re-run.
--
-- Companion file: 001_dispatch_rls.sql (Row Level Security policies)
-- =============================================================================

-- ── Extensions ───────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- for gen_random_uuid()

-- =============================================================================
-- 1. agents — known agents and their capabilities
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.agents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  codename      text,
  role          text,
  runtime_key   text,
  capabilities  jsonb NOT NULL DEFAULT '[]'::jsonb,
  status        text NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'inactive', 'unavailable', 'deprecated')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS agents_runtime_key_idx
  ON public.agents (runtime_key) WHERE runtime_key IS NOT NULL;

-- =============================================================================
-- 2. campaigns — canonical campaign record
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.campaigns (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name               text NOT NULL,
  description        text,
  campaign_type      text NOT NULL
                     CHECK (campaign_type IN (
                       'data_operation', 'content_pipeline', 'task_orchestration',
                       'product_development', 'research', 'finance_audit',
                       'document_processing', 'integration_workflow', 'general_execution'
                     )),
  status             text NOT NULL DEFAULT 'draft'
                     CHECK (status IN (
                       'draft', 'approved', 'queued', 'running',
                       'waiting_for_approval', 'blocked', 'paused',
                       'completed', 'failed', 'archived'
                     )),
  priority           text CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  objective          text,
  success_criteria   jsonb,
  progress_mode      text CHECK (progress_mode IN (
                       'work_item_completion', 'artifact_completion',
                       'event_milestone', 'checklist', 'manual_status',
                       'external_signal', 'mixed'
                     )),
  progress_summary   jsonb,
  owner_id           uuid,
  created_by         text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  started_at         timestamptz,
  completed_at       timestamptz,
  due_at             timestamptz,
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS campaigns_status_idx ON public.campaigns (status);
CREATE INDEX IF NOT EXISTS campaigns_campaign_type_idx ON public.campaigns (campaign_type);
CREATE INDEX IF NOT EXISTS campaigns_priority_idx ON public.campaigns (priority);
CREATE INDEX IF NOT EXISTS campaigns_created_at_idx ON public.campaigns (created_at DESC);
CREATE INDEX IF NOT EXISTS campaigns_owner_id_idx ON public.campaigns (owner_id);

-- =============================================================================
-- 3. campaign_agents — many-to-many between campaigns and agents
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.campaign_agents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  agent_id        uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  assignment_role text CHECK (assignment_role IN (
                    'owner', 'executor', 'reviewer', 'validator',
                    'supervisor', 'fallback', 'observer'
                  )),
  is_primary      boolean NOT NULL DEFAULT false,
  assigned_at     timestamptz NOT NULL DEFAULT now(),
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS campaign_agents_campaign_id_idx
  ON public.campaign_agents (campaign_id);
CREATE INDEX IF NOT EXISTS campaign_agents_agent_id_idx
  ON public.campaign_agents (agent_id);
CREATE UNIQUE INDEX IF NOT EXISTS campaign_agents_unique_role_idx
  ON public.campaign_agents (campaign_id, agent_id, assignment_role);

-- =============================================================================
-- 4. campaign_work_items — discrete units of work inside a campaign
-- (approval_id FK is added at the bottom of this file due to circular ref
--  with the approvals table)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.campaign_work_items (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id              uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  parent_work_item_id      uuid REFERENCES public.campaign_work_items(id) ON DELETE SET NULL,
  title                    text NOT NULL,
  description              text,
  status                   text NOT NULL DEFAULT 'pending'
                           CHECK (status IN (
                             'pending', 'queued', 'running', 'waiting_for_approval',
                             'blocked', 'completed', 'failed', 'skipped', 'cancelled'
                           )),
  sequence_order           integer,
  assigned_agent_id        uuid REFERENCES public.agents(id) ON DELETE SET NULL,
  dependencies             jsonb NOT NULL DEFAULT '[]'::jsonb,
  expected_artifact_type   text,
  risk_level               text NOT NULL DEFAULT 'low'
                           CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  approval_required        boolean NOT NULL DEFAULT false,
  approval_id              uuid,  -- FK added at end of file
  started_at               timestamptz,
  completed_at             timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  metadata                 jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS campaign_work_items_campaign_id_idx
  ON public.campaign_work_items (campaign_id);
CREATE INDEX IF NOT EXISTS campaign_work_items_status_idx
  ON public.campaign_work_items (status);
CREATE INDEX IF NOT EXISTS campaign_work_items_assigned_agent_idx
  ON public.campaign_work_items (assigned_agent_id);
CREATE INDEX IF NOT EXISTS campaign_work_items_parent_idx
  ON public.campaign_work_items (parent_work_item_id);
CREATE INDEX IF NOT EXISTS campaign_work_items_campaign_sequence_idx
  ON public.campaign_work_items (campaign_id, sequence_order);

-- =============================================================================
-- 5. artifacts — outputs, files, links, documents, datasets, references
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.artifacts (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id            uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  work_item_id           uuid REFERENCES public.campaign_work_items(id) ON DELETE SET NULL,
  artifact_type          text NOT NULL
                         CHECK (artifact_type IN (
                           'markdown', 'document', 'spreadsheet', 'image', 'video',
                           'dataset', 'source', 'audit_record', 'task_list',
                           'code', 'external_link', 'note', 'log', 'other'
                         )),
  title                  text NOT NULL,
  description            text,
  path_or_url            text,
  storage_provider       text,
  content_summary        text,
  content_hash           text,
  produced_by_agent_id   uuid REFERENCES public.agents(id) ON DELETE SET NULL,
  validation_status      text NOT NULL DEFAULT 'unvalidated'
                         CHECK (validation_status IN (
                           'unvalidated', 'valid', 'invalid', 'stale',
                           'incomplete', 'needs_review'
                         )),
  current_version        integer NOT NULL DEFAULT 1,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  metadata               jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS artifacts_campaign_id_idx
  ON public.artifacts (campaign_id);
CREATE INDEX IF NOT EXISTS artifacts_work_item_id_idx
  ON public.artifacts (work_item_id);
CREATE INDEX IF NOT EXISTS artifacts_validation_status_idx
  ON public.artifacts (validation_status);
CREATE INDEX IF NOT EXISTS artifacts_artifact_type_idx
  ON public.artifacts (artifact_type);
CREATE INDEX IF NOT EXISTS artifacts_content_hash_idx
  ON public.artifacts (content_hash) WHERE content_hash IS NOT NULL;

-- =============================================================================
-- 6. artifact_validations — validation history for artifacts
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.artifact_validations (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id           uuid NOT NULL REFERENCES public.artifacts(id) ON DELETE CASCADE,
  campaign_id           uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  work_item_id          uuid REFERENCES public.campaign_work_items(id) ON DELETE SET NULL,
  validator_agent_id    uuid REFERENCES public.agents(id) ON DELETE SET NULL,
  validation_status     text NOT NULL
                        CHECK (validation_status IN (
                          'unvalidated', 'valid', 'invalid', 'stale',
                          'incomplete', 'needs_review'
                        )),
  validation_notes      text,
  validation_evidence   jsonb NOT NULL DEFAULT '{}'::jsonb,
  checked_at            timestamptz NOT NULL DEFAULT now(),
  metadata              jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS artifact_validations_artifact_id_idx
  ON public.artifact_validations (artifact_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS artifact_validations_campaign_id_idx
  ON public.artifact_validations (campaign_id);

-- =============================================================================
-- 7. campaign_events — append-only event log
-- (No UPDATE/DELETE policies are granted in companion RLS file.)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.campaign_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id   uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  work_item_id  uuid REFERENCES public.campaign_work_items(id) ON DELETE SET NULL,
  agent_id      uuid REFERENCES public.agents(id) ON DELETE SET NULL,
  event_type    text NOT NULL
                CHECK (event_type IN (
                  'campaign_created', 'campaign_updated', 'campaign_approved',
                  'campaign_queued', 'campaign_started', 'campaign_paused',
                  'campaign_resumed', 'campaign_cancelled', 'campaign_completed',
                  'campaign_failed', 'agent_assigned', 'work_item_created',
                  'work_item_started', 'work_item_completed', 'artifact_created',
                  'artifact_updated', 'artifact_validated', 'blocker_created',
                  'blocker_resolved', 'approval_requested', 'approval_granted',
                  'approval_rejected', 'execution_started', 'execution_progress',
                  'execution_resumed', 'execution_failed',
                  'watchdog_stall_detected', 'resume_directive_created'
                )),
  message       text,
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS campaign_events_campaign_id_idx
  ON public.campaign_events (campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS campaign_events_created_at_idx
  ON public.campaign_events (created_at DESC);
CREATE INDEX IF NOT EXISTS campaign_events_event_type_idx
  ON public.campaign_events (event_type);
CREATE INDEX IF NOT EXISTS campaign_events_work_item_id_idx
  ON public.campaign_events (work_item_id);

-- =============================================================================
-- 8. blockers — actionable blockers with evidence and fallback history
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.blockers (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id              uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  work_item_id             uuid REFERENCES public.campaign_work_items(id) ON DELETE SET NULL,
  created_by_agent_id      uuid REFERENCES public.agents(id) ON DELETE SET NULL,
  summary                  text NOT NULL,
  details                  text,
  severity                 text NOT NULL DEFAULT 'medium'
                           CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status                   text NOT NULL DEFAULT 'open'
                           CHECK (status IN ('open', 'in_review', 'resolved', 'dismissed', 'stale')),
  attempted_method         text,
  failure_evidence         jsonb NOT NULL DEFAULT '{}'::jsonb,
  fallback_attempts        jsonb NOT NULL DEFAULT '[]'::jsonb,
  required_resolution      text,
  resolver_type            text CHECK (resolver_type IN (
                             'user', 'agent', 'builder', 'gateway',
                             'external_system', 'unknown'
                           )),
  resolver_id              text,
  can_continue_elsewhere   boolean NOT NULL DEFAULT false,
  created_at               timestamptz NOT NULL DEFAULT now(),
  resolved_at              timestamptz,
  metadata                 jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS blockers_campaign_id_idx ON public.blockers (campaign_id);
CREATE INDEX IF NOT EXISTS blockers_status_idx ON public.blockers (status);
CREATE INDEX IF NOT EXISTS blockers_severity_idx ON public.blockers (severity);
CREATE INDEX IF NOT EXISTS blockers_work_item_id_idx ON public.blockers (work_item_id);

-- =============================================================================
-- 9. approvals — approval requests and decisions
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.approvals (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id              uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  work_item_id             uuid REFERENCES public.campaign_work_items(id) ON DELETE SET NULL,
  requested_by_agent_id    uuid REFERENCES public.agents(id) ON DELETE SET NULL,
  approval_type            text NOT NULL
                           CHECK (approval_type IN (
                             'external_post', 'purchase', 'deletion',
                             'financial_action', 'customer_contact',
                             'public_content', 'database_mutation',
                             'file_overwrite', 'sensitive_data_use', 'generic_risk'
                           )),
  risk_level               text NOT NULL
                           CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  requested_action         text NOT NULL,
  reason                   text,
  status                   text NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'cancelled')),
  approved_by              text,
  rejected_by              text,
  decision_notes           text,
  expires_at               timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  decided_at               timestamptz,
  metadata                 jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS approvals_campaign_id_idx ON public.approvals (campaign_id);
CREATE INDEX IF NOT EXISTS approvals_status_idx ON public.approvals (status);
CREATE INDEX IF NOT EXISTS approvals_work_item_id_idx ON public.approvals (work_item_id);
CREATE INDEX IF NOT EXISTS approvals_expires_at_idx
  ON public.approvals (expires_at) WHERE status = 'pending' AND expires_at IS NOT NULL;

-- =============================================================================
-- 10. execution_attempts — runtime attempts by Gateway or an agent
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.execution_attempts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id         uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  work_item_id        uuid REFERENCES public.campaign_work_items(id) ON DELETE SET NULL,
  agent_id            uuid REFERENCES public.agents(id) ON DELETE SET NULL,
  gateway_run_id      text,
  attempt_number      integer NOT NULL,
  status              text NOT NULL DEFAULT 'started'
                      CHECK (status IN ('started', 'running', 'succeeded', 'failed', 'stalled', 'cancelled', 'resumed')),
  execution_mode      text CHECK (execution_mode IN (
                        'api', 'cli', 'browser', 'file_operation',
                        'database', 'manual_approval', 'agent_handoff', 'mixed'
                      )),
  started_at          timestamptz NOT NULL DEFAULT now(),
  completed_at        timestamptz,
  input_payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message       text,
  fallback_used       boolean NOT NULL DEFAULT false,
  fallback_details    jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata            jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS execution_attempts_campaign_id_idx
  ON public.execution_attempts (campaign_id, started_at DESC);
CREATE INDEX IF NOT EXISTS execution_attempts_status_idx
  ON public.execution_attempts (status);
CREATE INDEX IF NOT EXISTS execution_attempts_work_item_id_idx
  ON public.execution_attempts (work_item_id);
CREATE INDEX IF NOT EXISTS execution_attempts_gateway_run_id_idx
  ON public.execution_attempts (gateway_run_id) WHERE gateway_run_id IS NOT NULL;

-- =============================================================================
-- 11. resume_directives — watchdog/runtime instructions to resume stalls
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.resume_directives (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id              uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  work_item_id             uuid REFERENCES public.campaign_work_items(id) ON DELETE SET NULL,
  created_by               text,
  recommended_agent_id     uuid REFERENCES public.agents(id) ON DELETE SET NULL,
  stall_reason             text,
  last_valid_event_id      uuid REFERENCES public.campaign_events(id) ON DELETE SET NULL,
  next_executable_action   text NOT NULL,
  required_artifact_type   text,
  required_validation      text,
  fallback_method          text,
  approval_required        boolean NOT NULL DEFAULT false,
  status                   text NOT NULL DEFAULT 'open'
                           CHECK (status IN ('open', 'consumed', 'superseded', 'dismissed', 'completed')),
  created_at               timestamptz NOT NULL DEFAULT now(),
  consumed_at              timestamptz,
  metadata                 jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS resume_directives_campaign_id_idx
  ON public.resume_directives (campaign_id);
CREATE INDEX IF NOT EXISTS resume_directives_status_idx
  ON public.resume_directives (status);
CREATE INDEX IF NOT EXISTS resume_directives_work_item_id_idx
  ON public.resume_directives (work_item_id);

-- =============================================================================
-- 12. campaign_sources — input sources used by campaigns
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.campaign_sources (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id   uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  source_type   text NOT NULL
                CHECK (source_type IN (
                  'document', 'url', 'file', 'dataset', 'repository',
                  'screenshot', 'email', 'calendar', 'database_record',
                  'external_system', 'manual_note', 'other'
                )),
  title         text,
  path_or_url   text,
  description   text,
  added_by      text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS campaign_sources_campaign_id_idx
  ON public.campaign_sources (campaign_id);
CREATE INDEX IF NOT EXISTS campaign_sources_source_type_idx
  ON public.campaign_sources (source_type);

-- =============================================================================
-- 13. campaign_tags — flexible tags on campaigns/work-items/artifacts
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.campaign_tags (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id   uuid REFERENCES public.campaigns(id) ON DELETE CASCADE,
  work_item_id  uuid REFERENCES public.campaign_work_items(id) ON DELETE CASCADE,
  artifact_id   uuid REFERENCES public.artifacts(id) ON DELETE CASCADE,
  tag           text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (campaign_id IS NOT NULL)::int +
    (work_item_id IS NOT NULL)::int +
    (artifact_id IS NOT NULL)::int = 1
  )
);

CREATE INDEX IF NOT EXISTS campaign_tags_campaign_id_idx
  ON public.campaign_tags (campaign_id, tag);
CREATE INDEX IF NOT EXISTS campaign_tags_work_item_id_idx
  ON public.campaign_tags (work_item_id, tag);
CREATE INDEX IF NOT EXISTS campaign_tags_artifact_id_idx
  ON public.campaign_tags (artifact_id, tag);
CREATE INDEX IF NOT EXISTS campaign_tags_tag_idx ON public.campaign_tags (tag);

-- =============================================================================
-- Deferred FK: campaign_work_items.approval_id -> approvals(id)
-- (deferred because of the circular dependency: approvals.work_item_id ->
--  campaign_work_items.id and campaign_work_items.approval_id -> approvals.id)
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'campaign_work_items_approval_id_fkey'
  ) THEN
    ALTER TABLE public.campaign_work_items
      ADD CONSTRAINT campaign_work_items_approval_id_fkey
      FOREIGN KEY (approval_id)
      REFERENCES public.approvals(id)
      ON DELETE SET NULL;
  END IF;
END $$;
