-- =============================================================================
-- Dispatch / Mission Control — Row Level Security policies
-- =============================================================================
-- Companion to 000_dispatch_schema.sql.
--
-- Access model:
--   • service_role  → full bypass (Gateway, watchdog, server-side jobs)
--   • authenticated → SELECT/INSERT/UPDATE on campaigns they own
--                     (owner_id = auth.uid() OR owner_id IS NULL for shared)
--                   → cascading access to work_items, artifacts, events, etc.
--                     based on campaign ownership
--                   → cannot DELETE or UPDATE the append-only campaign_events table
--                   → cannot self-approve their own approvals (decided_by must
--                     be set by service_role)
--   • anon          → no access
--
-- Idempotent: every CREATE POLICY is preceded by DROP POLICY IF EXISTS.
-- =============================================================================

-- ── Helper: check if caller owns (or has access to) a campaign ──────────────
-- Inlined as EXISTS subqueries in policies below — no helper function so the
-- policies remain readable in the Supabase dashboard.

-- =============================================================================
-- Enable RLS on every table
-- =============================================================================
ALTER TABLE public.agents                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_agents       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_work_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artifacts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artifact_validations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_events       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blockers              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approvals             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.execution_attempts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resume_directives     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_sources      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_tags         ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- agents — globally readable; only service_role mutates
-- =============================================================================
DROP POLICY IF EXISTS agents_read_all ON public.agents;
CREATE POLICY agents_read_all ON public.agents
  FOR SELECT TO authenticated USING (true);

-- (service_role bypasses RLS; no INSERT/UPDATE/DELETE policy for authenticated)

-- =============================================================================
-- campaigns — owner-scoped + nullable-owner shared rows
-- =============================================================================
DROP POLICY IF EXISTS campaigns_read_own ON public.campaigns;
CREATE POLICY campaigns_read_own ON public.campaigns
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR owner_id IS NULL);

DROP POLICY IF EXISTS campaigns_insert_own ON public.campaigns;
CREATE POLICY campaigns_insert_own ON public.campaigns
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() OR owner_id IS NULL);

DROP POLICY IF EXISTS campaigns_update_own ON public.campaigns;
CREATE POLICY campaigns_update_own ON public.campaigns
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR owner_id IS NULL)
  WITH CHECK (owner_id = auth.uid() OR owner_id IS NULL);

-- No DELETE policy — campaigns are archived via status='archived', not deleted.

-- =============================================================================
-- campaign_agents — read/write follows campaign ownership
-- =============================================================================
DROP POLICY IF EXISTS campaign_agents_read ON public.campaign_agents;
CREATE POLICY campaign_agents_read ON public.campaign_agents
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE c.id = campaign_agents.campaign_id
      AND (c.owner_id = auth.uid() OR c.owner_id IS NULL)
  ));

DROP POLICY IF EXISTS campaign_agents_write ON public.campaign_agents;
CREATE POLICY campaign_agents_write ON public.campaign_agents
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE c.id = campaign_agents.campaign_id
      AND (c.owner_id = auth.uid() OR c.owner_id IS NULL)
  ));

-- =============================================================================
-- campaign_work_items — read/write follows campaign ownership
-- =============================================================================
DROP POLICY IF EXISTS campaign_work_items_read ON public.campaign_work_items;
CREATE POLICY campaign_work_items_read ON public.campaign_work_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE c.id = campaign_work_items.campaign_id
      AND (c.owner_id = auth.uid() OR c.owner_id IS NULL)
  ));

DROP POLICY IF EXISTS campaign_work_items_write ON public.campaign_work_items;
CREATE POLICY campaign_work_items_write ON public.campaign_work_items
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE c.id = campaign_work_items.campaign_id
      AND (c.owner_id = auth.uid() OR c.owner_id IS NULL)
  ));

DROP POLICY IF EXISTS campaign_work_items_update ON public.campaign_work_items;
CREATE POLICY campaign_work_items_update ON public.campaign_work_items
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE c.id = campaign_work_items.campaign_id
      AND (c.owner_id = auth.uid() OR c.owner_id IS NULL)
  ));

-- =============================================================================
-- artifacts — read/write follows campaign ownership
-- =============================================================================
DROP POLICY IF EXISTS artifacts_read ON public.artifacts;
CREATE POLICY artifacts_read ON public.artifacts
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE c.id = artifacts.campaign_id
      AND (c.owner_id = auth.uid() OR c.owner_id IS NULL)
  ));

DROP POLICY IF EXISTS artifacts_write ON public.artifacts;
CREATE POLICY artifacts_write ON public.artifacts
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE c.id = artifacts.campaign_id
      AND (c.owner_id = auth.uid() OR c.owner_id IS NULL)
  ));

DROP POLICY IF EXISTS artifacts_update ON public.artifacts;
CREATE POLICY artifacts_update ON public.artifacts
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE c.id = artifacts.campaign_id
      AND (c.owner_id = auth.uid() OR c.owner_id IS NULL)
  ));

-- =============================================================================
-- artifact_validations — read follows campaign; only service_role writes
-- =============================================================================
DROP POLICY IF EXISTS artifact_validations_read ON public.artifact_validations;
CREATE POLICY artifact_validations_read ON public.artifact_validations
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE c.id = artifact_validations.campaign_id
      AND (c.owner_id = auth.uid() OR c.owner_id IS NULL)
  ));

-- =============================================================================
-- campaign_events — read follows campaign; INSERT allowed; no UPDATE/DELETE
-- =============================================================================
DROP POLICY IF EXISTS campaign_events_read ON public.campaign_events;
CREATE POLICY campaign_events_read ON public.campaign_events
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE c.id = campaign_events.campaign_id
      AND (c.owner_id = auth.uid() OR c.owner_id IS NULL)
  ));

DROP POLICY IF EXISTS campaign_events_insert ON public.campaign_events;
CREATE POLICY campaign_events_insert ON public.campaign_events
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE c.id = campaign_events.campaign_id
      AND (c.owner_id = auth.uid() OR c.owner_id IS NULL)
  ));

-- Append-only: NO UPDATE or DELETE policies for authenticated.
-- service_role bypasses RLS for backfills/migrations.

-- =============================================================================
-- blockers — read/write follows campaign ownership
-- =============================================================================
DROP POLICY IF EXISTS blockers_read ON public.blockers;
CREATE POLICY blockers_read ON public.blockers
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE c.id = blockers.campaign_id
      AND (c.owner_id = auth.uid() OR c.owner_id IS NULL)
  ));

DROP POLICY IF EXISTS blockers_write ON public.blockers;
CREATE POLICY blockers_write ON public.blockers
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE c.id = blockers.campaign_id
      AND (c.owner_id = auth.uid() OR c.owner_id IS NULL)
  ));

DROP POLICY IF EXISTS blockers_update ON public.blockers;
CREATE POLICY blockers_update ON public.blockers
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE c.id = blockers.campaign_id
      AND (c.owner_id = auth.uid() OR c.owner_id IS NULL)
  ));

-- =============================================================================
-- approvals — read follows campaign; INSERT requests; UPDATE only via service
-- (decisions: approved_by/rejected_by/decided_at must be set by service_role
--  to prevent self-approval bypass.)
-- =============================================================================
DROP POLICY IF EXISTS approvals_read ON public.approvals;
CREATE POLICY approvals_read ON public.approvals
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE c.id = approvals.campaign_id
      AND (c.owner_id = auth.uid() OR c.owner_id IS NULL)
  ));

DROP POLICY IF EXISTS approvals_request ON public.approvals;
CREATE POLICY approvals_request ON public.approvals
  FOR INSERT TO authenticated
  WITH CHECK (
    status = 'pending'
    AND approved_by IS NULL
    AND rejected_by IS NULL
    AND decided_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = approvals.campaign_id
        AND (c.owner_id = auth.uid() OR c.owner_id IS NULL)
    )
  );

-- No UPDATE policy for authenticated → decisions go through service_role
-- (an API route that audits the approving identity before applying the change).

-- =============================================================================
-- execution_attempts — read follows campaign; only service_role writes
-- =============================================================================
DROP POLICY IF EXISTS execution_attempts_read ON public.execution_attempts;
CREATE POLICY execution_attempts_read ON public.execution_attempts
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE c.id = execution_attempts.campaign_id
      AND (c.owner_id = auth.uid() OR c.owner_id IS NULL)
  ));

-- =============================================================================
-- resume_directives — read follows campaign; only service_role writes
-- =============================================================================
DROP POLICY IF EXISTS resume_directives_read ON public.resume_directives;
CREATE POLICY resume_directives_read ON public.resume_directives
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE c.id = resume_directives.campaign_id
      AND (c.owner_id = auth.uid() OR c.owner_id IS NULL)
  ));

-- =============================================================================
-- campaign_sources — read/write follows campaign ownership
-- =============================================================================
DROP POLICY IF EXISTS campaign_sources_read ON public.campaign_sources;
CREATE POLICY campaign_sources_read ON public.campaign_sources
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE c.id = campaign_sources.campaign_id
      AND (c.owner_id = auth.uid() OR c.owner_id IS NULL)
  ));

DROP POLICY IF EXISTS campaign_sources_write ON public.campaign_sources;
CREATE POLICY campaign_sources_write ON public.campaign_sources
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE c.id = campaign_sources.campaign_id
      AND (c.owner_id = auth.uid() OR c.owner_id IS NULL)
  ));

-- =============================================================================
-- campaign_tags — read/write follows whichever parent the tag attaches to
-- =============================================================================
DROP POLICY IF EXISTS campaign_tags_read ON public.campaign_tags;
CREATE POLICY campaign_tags_read ON public.campaign_tags
  FOR SELECT TO authenticated
  USING (
    (campaign_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_tags.campaign_id
        AND (c.owner_id = auth.uid() OR c.owner_id IS NULL)
    ))
    OR (work_item_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.campaign_work_items w
      JOIN public.campaigns c ON c.id = w.campaign_id
      WHERE w.id = campaign_tags.work_item_id
        AND (c.owner_id = auth.uid() OR c.owner_id IS NULL)
    ))
    OR (artifact_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.artifacts a
      JOIN public.campaigns c ON c.id = a.campaign_id
      WHERE a.id = campaign_tags.artifact_id
        AND (c.owner_id = auth.uid() OR c.owner_id IS NULL)
    ))
  );

DROP POLICY IF EXISTS campaign_tags_write ON public.campaign_tags;
CREATE POLICY campaign_tags_write ON public.campaign_tags
  FOR INSERT TO authenticated
  WITH CHECK (
    (campaign_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_tags.campaign_id
        AND (c.owner_id = auth.uid() OR c.owner_id IS NULL)
    ))
    OR (work_item_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.campaign_work_items w
      JOIN public.campaigns c ON c.id = w.campaign_id
      WHERE w.id = campaign_tags.work_item_id
        AND (c.owner_id = auth.uid() OR c.owner_id IS NULL)
    ))
    OR (artifact_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.artifacts a
      JOIN public.campaigns c ON c.id = a.campaign_id
      WHERE a.id = campaign_tags.artifact_id
        AND (c.owner_id = auth.uid() OR c.owner_id IS NULL)
    ))
  );
