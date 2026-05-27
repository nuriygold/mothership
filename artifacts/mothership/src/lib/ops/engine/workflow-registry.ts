export type WorkflowRegistryStatus = 'supported' | 'legacy_disabled';

export type WorkflowRegistryEntry = {
  id: string;
  name: string;
  status: WorkflowRegistryStatus;
  controlPlane: 'ops' | 'dispatch' | 'agent';
  trigger: string[];
  inputSchema: string;
  steps: string[];
  durableOutput: string[];
  owner: string;
  notes?: string;
};

export const workflowRegistry = [
  {
    id: 'ops.campaign.dispatch_backed.create',
    name: 'Dispatch-backed ops campaign creation',
    status: 'supported',
    controlPlane: 'ops',
    trigger: ['POST /api/ops/campaigns'],
    inputSchema: 'CreateCampaignInput',
    steps: [
      'Validate campaign name and objective',
      'Project UI input into durable campaign metadata',
      'Create the campaign row and assign the lead agent',
      'Start dispatch-backed execution asynchronously',
    ],
    durableOutput: [
      'mcCampaigns row',
      'campaign_events entries',
      'dispatchBinding metadata',
      'campaign artifacts, blockers, attempts',
    ],
    owner: 'Durable Ops',
  },
  {
    id: 'ops.campaign.control',
    name: 'Ops campaign control actions',
    status: 'supported',
    controlPlane: 'ops',
    trigger: ['POST /api/ops/campaigns/:id/control'],
    inputSchema: '{ action: "resume" | "force_retry" | "approve_action" | "escalate" | "kill" }',
    steps: [
      'Load the durable campaign row',
      'Resolve open blockers when needed',
      'Resume or retry through the dispatch-backed bridge when applicable',
      'Reject legacy non-dispatch execution unless ENABLE_LEGACY_DURABLE_OPS=true',
      'Record the resulting campaign state and feed event',
    ],
    durableOutput: [
      'campaign status updates',
      'campaign_events entries',
      'blocker resolution records',
    ],
    owner: 'Durable Ops',
  },
  {
    id: 'ops.campaign.bootstrap.rehydrate',
    name: 'Ops campaign rehydration on process start',
    status: 'supported',
    controlPlane: 'ops',
    trigger: ['api-server bootstrap() on startup'],
    inputSchema: 'No request payload, uses durable queued and running campaigns',
    steps: [
      'Register default tools',
      'List queued and running campaigns from durable storage',
      'Resume each campaign through the dispatch-backed bridge when present',
      'Skip legacy non-dispatch campaigns unless ENABLE_LEGACY_DURABLE_OPS=true',
    ],
    durableOutput: [
      'execution_resumed events',
      'recovered campaign execution',
    ],
    owner: 'api-server startup',
    notes: 'The legacy durable loop remains a compatibility fallback and is disabled by default. UI-created campaigns are expected to set executionBackend=dispatch.',
  },
  {
    id: 'ops.watchdog.force_resume_all',
    name: 'Ops watchdog force resume',
    status: 'supported',
    controlPlane: 'ops',
    trigger: ['POST /api/ops/watchdog { action: "force_resume_all" }'],
    inputSchema: '{ action: "force_resume_all" }',
    steps: [
      'List blocked and running campaigns',
      'Resume dispatch-backed campaigns through the control plane',
      'Report legacy non-dispatch campaigns as skipped unless ENABLE_LEGACY_DURABLE_OPS=true',
    ],
    durableOutput: [
      'campaign_events entries',
      'watchdog resume result payload',
    ],
    owner: 'Durable Ops watchdog',
  },
  {
    id: 'dispatch.campaign.create',
    name: 'Legacy dispatch campaign creation',
    status: 'legacy_disabled',
    controlPlane: 'dispatch',
    trigger: ['POST /api/dispatch/campaigns'],
    inputSchema: '{ title, description?, costBudgetCents?, timeBudgetSeconds?, callbackUrl?, callbackSecret? }',
    steps: [
      'Validate the request body',
      'Create the dispatch campaign row',
      'Return the new campaign for controlled debugging only',
    ],
    durableOutput: ['dispatchCampaigns row'],
    owner: 'Dispatch',
    notes: 'Disabled by default behind ENABLE_LEGACY_DISPATCH_INGRESS.',
  },
  {
    id: 'dispatch.queue.worker',
    name: 'Dispatch queue worker',
    status: 'supported',
    controlPlane: 'dispatch',
    trigger: ['processDispatchQueue()', 'bootstrap() replays queued dispatch campaigns'],
    inputSchema: 'No direct request payload, uses queued dispatch campaigns from durable storage',
    steps: [
      'Recover stale EXECUTING campaigns',
      'Claim queued or scheduled campaigns',
      'Run the dispatch worker for each claimed campaign',
      'Mirror completion, blockers, artifacts, and callbacks back into Durable Ops',
    ],
    durableOutput: [
      'dispatchTasks rows',
      'auditEvents rows',
      'campaign output files',
      'callback webhook emissions',
    ],
    owner: 'Dispatch worker',
  },
  {
    id: 'agent.chat.turn',
    name: 'Owner-gated agent chat turn',
    status: 'supported',
    controlPlane: 'agent',
    trigger: ['POST /api/agent'],
    inputSchema: '{ text, sessionId, agent? }',
    steps: [
      'Resolve the dispatch agent id from the session or request',
      'Persist the chat session and user message',
      'Dispatch the turn through the shared OpenClaw helper',
      'Stream the assistant reply as SSE and persist the assistant message',
    ],
    durableOutput: [
      'ChatSession rows',
      'ChatMessage rows',
    ],
    owner: 'api-server agent routes',
  },
  {
    id: 'agent.chat.v2.dispatch',
    name: 'Owner-gated v2 agent dispatch',
    status: 'supported',
    controlPlane: 'agent',
    trigger: ['POST /api/v2/:agent/dispatch'],
    inputSchema: '{ text, sessionId }',
    steps: [
      'Validate the route agent',
      'Resolve the dispatch agent id',
      'Persist the chat session and user message',
      'Dispatch the turn through the shared OpenClaw helper',
      'Stream the assistant reply as SSE and persist the assistant message',
    ],
    durableOutput: [
      'ChatSession rows',
      'ChatMessage rows',
    ],
    owner: 'api-server v2 routes',
  },
] as const satisfies readonly WorkflowRegistryEntry[];

export function listWorkflowRegistry(): WorkflowRegistryEntry[] {
  return workflowRegistry.map((entry) => ({
    ...entry,
    trigger: [...entry.trigger],
    steps: [...entry.steps],
    durableOutput: [...entry.durableOutput],
  }));
}
