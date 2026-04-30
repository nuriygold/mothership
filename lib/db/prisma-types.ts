export type JsonValue = any;
export type JsonObject = Record<string, any>;
export type JsonArray = any[];
export type InputJsonValue = any;
export type InputJsonObject = Record<string, any>;

export namespace Prisma {
  export type JsonValue = import('./prisma-types').JsonValue;
  export type JsonObject = import('./prisma-types').JsonObject;
  export type JsonArray = import('./prisma-types').JsonArray;
  export type InputJsonValue = import('./prisma-types').InputJsonValue;
  export type InputJsonObject = import('./prisma-types').InputJsonObject;
}

function makeEnum<const T extends string>(values: readonly T[]) {
  return Object.freeze(
    Object.fromEntries(values.map((value) => [value, value])) as { readonly [K in T]: K }
  );
}

export const WorkflowType = makeEnum(['STANDARD', 'BOOMERANG'] as const);
export type WorkflowType = (typeof WorkflowType)[keyof typeof WorkflowType];

export const WorkflowStatus = makeEnum(['ACTIVE', 'INACTIVE', 'ARCHIVED'] as const);
export type WorkflowStatus = (typeof WorkflowStatus)[keyof typeof WorkflowStatus];

export const SubmissionValidationStatus = makeEnum(
  ['PENDING', 'VALIDATED', 'REJECTED', 'APPROVED'] as const
);
export type SubmissionValidationStatus =
  (typeof SubmissionValidationStatus)[keyof typeof SubmissionValidationStatus];

export const TaskStatus = makeEnum(['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED'] as const);
export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

export const TaskPriority = makeEnum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const);
export type TaskPriority = (typeof TaskPriority)[keyof typeof TaskPriority];

export const RunStatus = makeEnum(['QUEUED', 'RUNNING', 'SUCCESS', 'FAILED', 'CANCELED'] as const);
export type RunStatus = (typeof RunStatus)[keyof typeof RunStatus];

export const ApprovalDecision = makeEnum(['REQUESTED', 'APPROVED', 'DENIED'] as const);
export type ApprovalDecision = (typeof ApprovalDecision)[keyof typeof ApprovalDecision];

export const ConnectorStatus = makeEnum(['CONNECTED', 'DISCONNECTED', 'ERROR'] as const);
export type ConnectorStatus = (typeof ConnectorStatus)[keyof typeof ConnectorStatus];

export const CommandStatus = makeEnum(['RECEIVED', 'EXECUTING', 'COMPLETED', 'FAILED'] as const);
export type CommandStatus = (typeof CommandStatus)[keyof typeof CommandStatus];

export const PredictiveActionStatus = makeEnum(
  ['PENDING', 'APPROVED', 'REJECTED', 'EXECUTED'] as const
);
export type PredictiveActionStatus =
  (typeof PredictiveActionStatus)[keyof typeof PredictiveActionStatus];

export const IntegrationEventStatus = makeEnum(['RECEIVED', 'ROUTED', 'FAILED'] as const);
export type IntegrationEventStatus =
  (typeof IntegrationEventStatus)[keyof typeof IntegrationEventStatus];

export const DispatchCampaignStatus = makeEnum(
  ['DRAFT', 'PLANNING', 'READY', 'QUEUED', 'SCHEDULED', 'EXECUTING', 'PAUSED', 'COMPLETED'] as const
);
export type DispatchCampaignStatus =
  (typeof DispatchCampaignStatus)[keyof typeof DispatchCampaignStatus];

export const DispatchTaskStatus = makeEnum(
  ['PLANNED', 'QUEUED', 'RUNNING', 'DONE', 'FAILED', 'PARTIAL', 'CANCELED'] as const
);
export type DispatchTaskStatus =
  (typeof DispatchTaskStatus)[keyof typeof DispatchTaskStatus];

export const FinancePlanType = makeEnum(
  ['CREDIT_SCORE', 'BUDGET', 'SAVINGS', 'DEBT_PAYOFF', 'INVESTMENT', 'EXPENSE_REDUCTION', 'CUSTOM'] as const
);
export type FinancePlanType = (typeof FinancePlanType)[keyof typeof FinancePlanType];

export const FinancePlanStatus = makeEnum(['ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED'] as const);
export type FinancePlanStatus = (typeof FinancePlanStatus)[keyof typeof FinancePlanStatus];

export const VisionPillarColor = makeEnum(['MINT', 'LAVENDER', 'PEACH', 'SKY', 'PINK', 'LEMON'] as const);
export type VisionPillarColor = (typeof VisionPillarColor)[keyof typeof VisionPillarColor];

export const VisionItemStatus = makeEnum(['DREAMING', 'ACTIVE', 'ACHIEVED', 'ON_HOLD'] as const);
export type VisionItemStatus = (typeof VisionItemStatus)[keyof typeof VisionItemStatus];

export const EmailTriageBucket = makeEnum(
  [
    'ACT_SOON',
    'NEED_HUMAN_EYES',
    'BILLS',
    'RELATIONSHIP_KEEPER',
    'PERSONAL',
    'UPCOMING_EVENT',
    'OPPORTUNITY_PILE',
    'MARKETING',
    'NOT_YOUR_SPEED',
    'OTHER',
  ] as const
);
export type EmailTriageBucket = (typeof EmailTriageBucket)[keyof typeof EmailTriageBucket];

export const EmailTriageStatus = makeEnum(['PENDING', 'APPROVED', 'DENIED', 'EXECUTED'] as const);
export type EmailTriageStatus = (typeof EmailTriageStatus)[keyof typeof EmailTriageStatus];
