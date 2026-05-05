// Bridge between API routes and the Vercel Workflow / WDK runtime.
//
// Why this exists:
//   • API routes should not import workflow code directly. The workflow file
//     uses `'use workflow'` and is compiled by the WDK SWC plugin into a
//     bundle that runs in a sandboxed VM. Importing it from a route handler
//     should go through this adapter, which also handles the case where the
//     runtime isn't available (e.g. local dev without `npx workflow dev`).
//
//   • If `start()` fails because the runtime isn't reachable, we still return
//     a successful campaign creation so the UI works — the campaign just sits
//     in IDLE with a clear feed event explaining what happened. The moment
//     the runtime is provisioned, new dispatches start working without any
//     code changes.
//
//   • Control actions (cancel, resume) translate operator intent into the
//     correct Workflow API: `world.events.create()` for cancel,
//     `resumeHook()` for approval gates.

import {
  applyControl as applyLocalControl,
  createCampaign,
  getRunIdForCampaign,
  getCampaign,
  recordEvent,
  setCampaignRunId,
  setCampaignStatus,
} from './store';
import type {
  Campaign,
  CampaignControlAction,
  CreateCampaignInput,
} from './types';
import { opsControlHookToken } from '@/lib/ops/control-hook';

// ── Lazy runtime loaders ────────────────────────────────────────────────────
// We import the workflow modules lazily so that:
//   1. A misconfigured runtime never breaks `next build` page-data collection
//   2. Test environments without the SWC plugin can still import this file
async function loadWorkflowApi() {
  try {
    return await import('workflow/api');
  } catch (err) {
    console.warn('[ops/runtime] workflow/api not available:', describe(err));
    return null;
  }
}

async function loadMissionWorkflow() {
  try {
    const mod = await import('./workflows/mission');
    return mod.missionWorkflow;
  } catch (err) {
    console.warn('[ops/runtime] mission workflow not available:', describe(err));
    return null;
  }
}

async function loadWorld() {
  try {
    const mod = await import('workflow/runtime');
    return await mod.getWorld();
  } catch (err) {
    console.warn('[ops/runtime] workflow/runtime not available:', describe(err));
    return null;
  }
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ── Dispatch ────────────────────────────────────────────────────────────────
export async function dispatchMission(
  input: CreateCampaignInput
): Promise<Campaign> {
  // Always create the campaign record first so the UI sees the dispatch
  // even if the WDK runtime is offline.
  const campaign = createCampaign(input);

  const [api, workflowFn] = await Promise.all([
    loadWorkflowApi(),
    loadMissionWorkflow(),
  ]);

  if (!api || !workflowFn) {
    recordEvent(campaign.id, {
      level: 'warn',
      message:
        'WDK runtime not available — mission queued but not yet started. Deploy with Workflow enabled or run `npx workflow dev` to pick this up.',
    });
    return campaign;
  }

  try {
    const run = await api.start(workflowFn, [
      {
        campaignId: campaign.id,
        name: campaign.name,
        objective: campaign.objective,
        leadAgentId: campaign.leadAgentId,
        requiredArtifacts: campaign.requiredArtifacts,
        minimumBatchSize: campaign.minimumBatchSize,
        executionMode: campaign.executionMode,
      },
    ]);
    setCampaignRunId(campaign.id, run.runId);
    recordEvent(campaign.id, {
      level: 'success',
      message: `Workflow started · run=${run.runId.slice(0, 8)}…`,
    });
  } catch (err) {
    recordEvent(campaign.id, {
      level: 'error',
      message: `Failed to start workflow: ${describe(err)}`,
    });
  }

  return campaign;
}

// ── Control ─────────────────────────────────────────────────────────────────
// Translates operator intent into the correct Workflow API call. Falls
// back to local-only state changes when the runtime isn't reachable.
export async function controlMission(
  campaignId: string,
  action: CampaignControlAction
): Promise<Campaign | undefined> {
  const local = applyLocalControl(campaignId, action);
  if (!local) return undefined;

  const runId = getRunIdForCampaign(campaignId);
  const api = await loadWorkflowApi();

  // Hook-based controls (resume/approve/retry) work even when we don't have a
  // live `world` instance; they go through the workflow API.
  if (api && (action === 'resume' || action === 'approve_action' || action === 'force_retry')) {
    try {
      const token = opsControlHookToken(campaignId);
      await api.resumeHook(token, { action });
      recordEvent(campaignId, { level: 'success', message: `Sent hook: ${action}` });
      return getCampaign(campaignId) ?? local;
    } catch (err) {
      recordEvent(campaignId, {
        level: 'warn',
        message: `Hook "${action}" not accepted (no active hook?): ${describe(err)}`,
      });
      // For force_retry, fall through to "start a new run" behavior below.
    }
  }

  if (!runId) {
    // No durable run to act on. If operator requests a retry, attempt a fresh start.
    if (api && action === 'force_retry') {
      const current = getCampaign(campaignId);
      if (current) {
        const workflowFn = await loadMissionWorkflow();
        if (workflowFn) {
          try {
            const run = await api.start(workflowFn, [
              {
                campaignId: current.id,
                name: current.name,
                objective: current.objective,
                leadAgentId: current.leadAgentId,
                requiredArtifacts: current.requiredArtifacts,
                minimumBatchSize: current.minimumBatchSize,
                executionMode: current.executionMode,
              },
            ]);
            setCampaignRunId(current.id, run.runId);
            recordEvent(current.id, { level: 'success', message: `Workflow restarted · run=${run.runId.slice(0, 8)}…` });
          } catch (err) {
            recordEvent(current.id, { level: 'error', message: `Failed to restart workflow: ${describe(err)}` });
          }
        }
      }
    }
    return local;
  }

  const world = await loadWorld();
  if (!world) return local;

  try {
    if (action === 'kill') {
      // Append a `run_cancelled` event — the runtime materializes this into
      // a cancelled run on the next consumer pass.
      await world.events.create(runId, { eventType: 'run_cancelled' });
      setCampaignStatus(campaignId, 'CANCELLED');
      recordEvent(campaignId, {
        level: 'error',
        message: `Workflow run cancelled · run=${runId.slice(0, 8)}…`,
      });
    }
    // Other actions (resume, approve_action, force_retry) currently stay
    // local-only because they require workflow-side hook tokens that we'll
    // wire up in the next slice. The local state change above is enough
    // for the operator to see immediate feedback in the UI.
  } catch (err) {
    recordEvent(campaignId, {
      level: 'warn',
      message: `Workflow control "${action}" failed: ${describe(err)}`,
    });
  }

  return local;
}
