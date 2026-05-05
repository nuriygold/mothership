// Public surface for the durable ops engine. The api-server consumes this.
// Browser code MUST NOT import from here — it pulls in postgres-js + drizzle.

export { db, sql, schema } from './db';

export * as agents from './services/agents';
export * as campaigns from './services/campaigns';
export * as events from './services/events';
export * as artifactsSvc from './services/artifacts';
export * as blockers from './services/blockers';
export * as attempts from './services/attempts';
export * as projection from './services/projection';

export { runCampaign, resumeCampaign, isInflight } from './runtime';
export { bootstrap } from './bootstrap';
export {
  registerTool,
  listTools,
  invokeTool,
  type ToolAdapter,
  type ToolContext,
  type ToolOutcome,
} from './tools/registry';
export { registerDefaultTools } from './tools/adapters';

export { seedDemoCampaigns, clearDemoCampaigns, ensureDemoAgents } from './demo';
