import { writeArtifact } from '../services/artifacts';
import { registerTool, type ToolAdapter } from './registry';
import type { JsonObject, JsonValue } from '../../../db/json';

function asObject(v: JsonValue): JsonObject {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as JsonObject) : {};
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
  registerTool('artifact.write', artifactWrite);
  registerTool('db.read', dbReadStub);
  registerTool('db.write', dbWriteStub);
  registerTool(
    'web.extract',
    makeBlockerAdapter(
      'web.extract',
      'Wire a real web extraction adapter (e.g. Firecrawl, Browserbase) before invoking this tool.',
    ),
  );
  registerTool(
    'mcp.invoke',
    makeBlockerAdapter(
      'mcp.invoke',
      'Wire an MCP transport before invoking this tool.',
    ),
  );
  registerTool(
    'file.write',
    makeBlockerAdapter(
      'file.write',
      'External filesystem writes require an operator-approved adapter.',
    ),
  );
}
