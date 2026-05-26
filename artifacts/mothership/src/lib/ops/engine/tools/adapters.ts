import { writeArtifact } from '../services/artifacts';
import { registerTool, type ToolAdapter } from './registry';
import type { JsonObject, JsonValue } from '../../../db/json';

function asObject(v: JsonValue): JsonObject {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as JsonObject) : {};
}

function mockToolAdaptersEnabled() {
  return process.env.ENABLE_MOCK_TOOL_ADAPTERS === 'true';
}

const artifactWrite: ToolAdapter = async (input, ctx) => {
  const obj = asObject(input);
  const title = typeof obj.title === 'string' ? obj.title : 'untitled';
  const content = typeof obj.content === 'string' ? obj.content : JSON.stringify(obj.content ?? '');
  const artifactType = (typeof obj.artifactType === 'string' ? obj.artifactType : 'note') as
    | 'markdown'
    | 'note'
    | 'log'
    | 'document'
    | 'task_list'
    | 'code';

  const written = await writeArtifact({
    campaignId: ctx.campaignId,
    workItemId: ctx.workItemId,
    artifactType,
    title,
    description: typeof obj.description === 'string' ? obj.description : null,
    contentSummary: content.slice(0, 4096),
    producedByAgentId: ctx.agentId,
    metadata: { sizeBytes: Buffer.byteLength(content, 'utf8') },
  });

  return {
    ok: true,
    output: { artifactId: written.id, version: written.currentVersion },
  };
};

const dbReadStub: ToolAdapter = async (input, _ctx) => {
  const obj = asObject(input);
  if (!mockToolAdaptersEnabled()) {
    return {
      ok: false,
      blocker: {
        summary: 'Tool "db.read" is running in mock mode only.',
        details: 'Enable mock adapters explicitly for non-production testing, or wire a real read adapter.',
        severity: 'medium',
        attemptedMethod: 'db.read',
        failureEvidence: { input: obj, runtimeStatus: 'mock' },
        requiredResolution: 'Set ENABLE_MOCK_TOOL_ADAPTERS=true for intentional mock testing or implement a real db.read adapter.',
        canContinueElsewhere: true,
      },
    };
  }
  return {
    ok: true,
    output: {
      query: typeof obj.query === 'string' ? obj.query : null,
      rows: [],
      note: 'db.read stub — returns empty result set deterministically',
    },
  };
};

const dbWriteStub: ToolAdapter = async (input, _ctx) => {
  const obj = asObject(input);
  if (!mockToolAdaptersEnabled()) {
    return {
      ok: false,
      blocker: {
        summary: 'Tool "db.write" is running in mock mode only.',
        details: 'The current adapter never mutates state. Refusing to report success without explicit mock mode.',
        severity: 'high',
        attemptedMethod: 'db.write',
        failureEvidence: { input: obj, runtimeStatus: 'mock' },
        requiredResolution: 'Set ENABLE_MOCK_TOOL_ADAPTERS=true for intentional mock testing or implement a real db.write adapter.',
        canContinueElsewhere: false,
      },
    };
  }
  return {
    ok: true,
    output: {
      table: typeof obj.table === 'string' ? obj.table : null,
      affected: 0,
      note: 'db.write stub — no rows changed deterministically',
    },
  };
};

function makeBlockerAdapter(name: string, requiredResolution: string): ToolAdapter {
  return async (input, _ctx) => ({
    ok: false,
    blocker: {
      summary: `Tool "${name}" is not wired in this environment.`,
      details: `The engine refuses to fake success for "${name}". Provide a real adapter or have an operator complete this step.`,
      severity: 'medium',
      attemptedMethod: name,
      failureEvidence: { input },
      requiredResolution,
      canContinueElsewhere: true,
    },
  });
}

export function registerDefaultTools(): void {
  registerTool('artifact.write', artifactWrite, { runtimeStatus: 'active' });
  registerTool('db.read', dbReadStub, { runtimeStatus: 'mock' });
  registerTool('db.write', dbWriteStub, { runtimeStatus: 'mock' });
  registerTool(
    'web.extract',
    makeBlockerAdapter(
      'web.extract',
      'Wire a real web extraction adapter (e.g. Firecrawl, Browserbase) before invoking this tool.',
    ),
    { runtimeStatus: 'blocker' },
  );
  registerTool(
    'mcp.invoke',
    makeBlockerAdapter(
      'mcp.invoke',
      'Wire an MCP transport before invoking this tool.',
    ),
    { runtimeStatus: 'blocker' },
  );
  registerTool(
    'file.write',
    makeBlockerAdapter(
      'file.write',
      'External filesystem writes require an operator-approved adapter.',
    ),
    { runtimeStatus: 'blocker' },
  );
}
