export const WorkflowType = {
  STANDARD: 'STANDARD',
  BOOMERANG: 'BOOMERANG',
} as const;

export type WorkflowType = (typeof WorkflowType)[keyof typeof WorkflowType];

export const WorkflowStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  ARCHIVED: 'ARCHIVED',
} as const;

export type WorkflowStatus = (typeof WorkflowStatus)[keyof typeof WorkflowStatus];

export const SubmissionValidationStatus = {
  PENDING: 'PENDING',
  VALIDATED: 'VALIDATED',
  REJECTED: 'REJECTED',
  APPROVED: 'APPROVED',
} as const;

export type SubmissionValidationStatus =
  (typeof SubmissionValidationStatus)[keyof typeof SubmissionValidationStatus];

export const TaskStatus = {
  TODO: 'TODO',
  IN_PROGRESS: 'IN_PROGRESS',
  DONE: 'DONE',
  BLOCKED: 'BLOCKED',
} as const;

export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

export const TaskPriority = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
} as const;

export type TaskPriority = (typeof TaskPriority)[keyof typeof TaskPriority];

export const RunStatus = {
  QUEUED: 'QUEUED',
  RUNNING: 'RUNNING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  CANCELED: 'CANCELED',
} as const;

export type RunStatus = (typeof RunStatus)[keyof typeof RunStatus];

export const ApprovalDecision = {
  REQUESTED: 'REQUESTED',
  APPROVED: 'APPROVED',
  DENIED: 'DENIED',
} as const;

export type ApprovalDecision = (typeof ApprovalDecision)[keyof typeof ApprovalDecision];

export const ConnectorStatus = {
  CONNECTED: 'CONNECTED',
  DISCONNECTED: 'DISCONNECTED',
  ERROR: 'ERROR',
} as const;

export type ConnectorStatus = (typeof ConnectorStatus)[keyof typeof ConnectorStatus];

export const CommandStatus = {
  RECEIVED: 'RECEIVED',
  EXECUTING: 'EXECUTING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;

export type CommandStatus = (typeof CommandStatus)[keyof typeof CommandStatus];

export const PredictiveActionStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  EXECUTED: 'EXECUTED',
} as const;

export type PredictiveActionStatus =
  (typeof PredictiveActionStatus)[keyof typeof PredictiveActionStatus];

export const IntegrationEventStatus = {
  RECEIVED: 'RECEIVED',
  ROUTED: 'ROUTED',
  FAILED: 'FAILED',
} as const;

export type IntegrationEventStatus =
  (typeof IntegrationEventStatus)[keyof typeof IntegrationEventStatus];

export const DispatchCampaignStatus = {
  DRAFT: 'DRAFT',
  PLANNING: 'PLANNING',
  READY: 'READY',
  QUEUED: 'QUEUED',
  SCHEDULED: 'SCHEDULED',
  EXECUTING: 'EXECUTING',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED',
} as const;

export type DispatchCampaignStatus =
  (typeof DispatchCampaignStatus)[keyof typeof DispatchCampaignStatus];

export const DispatchTaskStatus = {
  PLANNED: 'PLANNED',
  QUEUED: 'QUEUED',
  RUNNING: 'RUNNING',
  DONE: 'DONE',
  FAILED: 'FAILED',
  PARTIAL: 'PARTIAL',
  CANCELED: 'CANCELED',
} as const;

export type DispatchTaskStatus = (typeof DispatchTaskStatus)[keyof typeof DispatchTaskStatus];

export const FinancePlanType = {
  CREDIT_SCORE: 'CREDIT_SCORE',
  BUDGET: 'BUDGET',
  SAVINGS: 'SAVINGS',
  DEBT_PAYOFF: 'DEBT_PAYOFF',
  INVESTMENT: 'INVESTMENT',
  EXPENSE_REDUCTION: 'EXPENSE_REDUCTION',
  CUSTOM: 'CUSTOM',
} as const;

export type FinancePlanType = (typeof FinancePlanType)[keyof typeof FinancePlanType];

export const FinancePlanStatus = {
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED',
  ARCHIVED: 'ARCHIVED',
} as const;

export type FinancePlanStatus = (typeof FinancePlanStatus)[keyof typeof FinancePlanStatus];

export const VisionPillarColor = {
  MINT: 'MINT',
  LAVENDER: 'LAVENDER',
  PEACH: 'PEACH',
  SKY: 'SKY',
  PINK: 'PINK',
  LEMON: 'LEMON',
} as const;

export type VisionPillarColor = (typeof VisionPillarColor)[keyof typeof VisionPillarColor];

export const VisionItemStatus = {
  DREAMING: 'DREAMING',
  ACTIVE: 'ACTIVE',
  ACHIEVED: 'ACHIEVED',
  ON_HOLD: 'ON_HOLD',
} as const;

export type VisionItemStatus = (typeof VisionItemStatus)[keyof typeof VisionItemStatus];

export const EmailTriageBucket = {
  ACT_SOON: 'ACT_SOON',
  NEED_HUMAN_EYES: 'NEED_HUMAN_EYES',
  BILLS: 'BILLS',
  RELATIONSHIP_KEEPER: 'RELATIONSHIP_KEEPER',
  PERSONAL: 'PERSONAL',
  UPCOMING_EVENT: 'UPCOMING_EVENT',
  OPPORTUNITY_PILE: 'OPPORTUNITY_PILE',
  MARKETING: 'MARKETING',
  NOT_YOUR_SPEED: 'NOT_YOUR_SPEED',
  OTHER: 'OTHER',
} as const;

export type EmailTriageBucket = (typeof EmailTriageBucket)[keyof typeof EmailTriageBucket];

export const EmailTriageStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  DENIED: 'DENIED',
  EXECUTED: 'EXECUTED',
} as const;

export type EmailTriageStatus = (typeof EmailTriageStatus)[keyof typeof EmailTriageStatus];
