// Shared types for the Mothership Ops control plane.
// These are intentionally framework-agnostic so the API routes can be
// swapped from mock data to a real backend without touching the UI.

export type CampaignStatus = 'RUNNING' | 'BLOCKED' | 'IDLE' | 'DEPLOYING' | 'COMPLETED';

export type AgentStatus = 'IDLE' | 'RUNNING' | 'BLOCKED';

export type ExecutionMode = 'STANDARD' | 'AGGRESSIVE';

export interface Agent {
  id: string;
  name: string;
  domain: string;
  capabilities: string[];
  status: AgentStatus;
  activeCampaignIds: string[];
}

export interface CampaignArtifact {
  name: string;
  size: number;
  rows?: number;
  updatedAt: string;
  preview: string;
}

export interface CampaignBlocker {
  type: string;
  attempts: number;
  requiredInput: string;
  detectedAt: string;
}

export interface CampaignQuickStats {
  filesUpdated: number;
  rowsProcessed: number;
  batchCount: number;
}

export interface FeedEvent {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
}

export interface Campaign {
  id: string;
  name: string;
  objective: string;
  leadAgentId: string;
  status: CampaignStatus;
  lastActivityAt: string;
  startedAt: string;
  progress: number; // 0..1
  quickStats: CampaignQuickStats;
  artifacts: CampaignArtifact[];
  blocker?: CampaignBlocker | null;
  feed: FeedEvent[];
  executionMode: ExecutionMode;
  minimumBatchSize: number;
  requiredArtifacts: string[];
}

export interface SystemRules {
  executionMode: boolean;        // global ON/OFF
  fallbackEnforcement: boolean;
  batchMinimum: number;
  watchdogIntervalMinutes: number;
  blockerThreshold: number;
}

export interface WatchdogState {
  inProgress: Array<{
    campaignId: string;
    name: string;
    leadAgentName: string;
    lastActivityAt: string;
    isStale: boolean;
    isMissingArtifacts: boolean;
    hasInvalidBlocker: boolean;
  }>;
  staleThresholdMinutes: number;
}

export interface OpsTickerEntry {
  label: string;
  status: 'OK' | 'WARN' | 'CRIT';
}

export interface OpsTickerSummary {
  activeCampaigns: number;
  blockedCampaigns: number;
  entries: OpsTickerEntry[];
}

export interface CreateCampaignInput {
  name: string;
  objective: string;
  leadAgentId: string;
  requiredArtifacts: string[];
  minimumBatchSize: number;
  executionMode: ExecutionMode;
}

export type CampaignControlAction =
  | 'resume'
  | 'force_retry'
  | 'approve_action'
  | 'escalate'
  | 'kill';
