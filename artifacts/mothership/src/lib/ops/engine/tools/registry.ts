import type { JsonValue } from '../../../db/json';
import type { Severity } from '../../../db/dispatch-schema';

export type ToolContext = {
  campaignId: string;
  workItemId?: string;
  agentId?: string;
};

export type ToolRuntimeStatus = 'active' | 'mock' | 'blocker' | 'disabled';

export type ToolDescriptor = {
  name: string;
  runtimeStatus: ToolRuntimeStatus;
};

export type ToolBlockerOutcome = {
  ok: false;
  blocker: {
    summary: string;
    details?: string;
    severity: Severity;
    attemptedMethod: string;
    failureEvidence: JsonValue;
    requiredResolution: string;
    canContinueElsewhere?: boolean;
  };
};

export type ToolSuccessOutcome<T extends JsonValue = JsonValue> = {
  ok: true;
  output: T;
  artifact?: {
    title: string;
    artifactType:
      | 'markdown'
      | 'document'
      | 'spreadsheet'
      | 'image'
      | 'video'
      | 'dataset'
      | 'source'
      | 'audit_record'
      | 'task_list'
      | 'code'
      | 'external_link'
      | 'note'
      | 'log'
      | 'other';
    description?: string;
    pathOrUrl?: string;
    contentSummary?: string;
    metadata?: JsonValue;
  };
};

export type ToolOutcome<T extends JsonValue = JsonValue> =
  | ToolSuccessOutcome<T>
  | ToolBlockerOutcome;

export type ToolAdapter = (
  input: JsonValue,
  ctx: ToolContext,
) => Promise<ToolOutcome>;

const adapters = new Map<string, ToolAdapter>();
const descriptors = new Map<string, ToolDescriptor>();

export function registerTool(
  name: string,
  adapter: ToolAdapter,
  descriptor?: Partial<Omit<ToolDescriptor, 'name'>>,
): void {
  adapters.set(name, adapter);
  descriptors.set(name, {
    name,
    runtimeStatus: descriptor?.runtimeStatus ?? 'active',
  });
}

export function getTool(name: string): ToolAdapter | undefined {
  return adapters.get(name);
}

export function listTools(): string[] {
  return Array.from(adapters.keys()).sort();
}

export function listToolDescriptors(): ToolDescriptor[] {
  return Array.from(descriptors.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export async function invokeTool(
  name: string,
  input: JsonValue,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const adapter = adapters.get(name);
  if (!adapter) {
    return {
      ok: false,
      blocker: {
        summary: `Unknown tool: ${name}`,
        severity: 'high',
        attemptedMethod: name,
        failureEvidence: { reason: 'tool_not_registered' },
        requiredResolution: `Register tool "${name}" or remove the call.`,
      },
    };
  }
  try {
    return await adapter(input, ctx);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      blocker: {
        summary: `Tool "${name}" threw: ${msg}`,
        severity: 'high',
        attemptedMethod: name,
        failureEvidence: { error: msg },
        requiredResolution: `Investigate adapter for "${name}".`,
      },
    };
  }
}
