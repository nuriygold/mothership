import { Card, CardSubtitle, CardTitle } from '@/components/ui/card';
import { checkGateway } from '@/lib/services/openclaw';

const bots = [
  { name: 'Adrian', role: 'Financial Ops', key: 'OPENCLAW_AGENT_ADRIAN' },
  { name: 'Ruby', role: 'Comms & Writing', key: 'OPENCLAW_AGENT_RUBY' },
  { name: 'Emerald', role: 'Research & Synthesis', key: 'OPENCLAW_AGENT_EMERALD' },
  { name: 'Adobe Pettaway', role: 'Document Intelligence', key: 'OPENCLAW_AGENT_ADOBE' },
  { name: 'Gateway', role: 'System Orchestration', key: 'OPENCLAW_GATEWAY' },
] as const;

export const dynamic = 'force-dynamic';

export default async function BotsPage() {
  const gateway = await checkGateway();
  const hasGatewayConfig = Boolean(process.env.OPENCLAW_GATEWAY && process.env.OPENCLAW_TOKEN);
  const hasDefaultAgent = Boolean(process.env.OPENCLAW_DEFAULT_AGENT);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Bots</h1>
        <p className="text-sm text-slate-500">Operational specialists and orchestration endpoints.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {bots.map((bot) => {
          const hasDirectMapping = Boolean(process.env[bot.key]);
          const status = bot.name === 'Gateway' ? gateway.ok : hasGatewayConfig;
          const statusText =
            bot.name === 'Gateway'
              ? status
                ? 'Configured'
                : 'Needs wiring'
              : hasDirectMapping
                ? 'Configured'
                : hasDefaultAgent
                  ? 'Using default routing'
                  : status
                    ? 'Reachable (no explicit mapping)'
                    : 'Needs wiring';

          return (
            <Card key={bot.name}>
              <CardTitle>{bot.name}</CardTitle>
              <CardSubtitle>{bot.role}</CardSubtitle>
              <div className="mt-2 text-sm">
                <p className={status ? 'text-emerald-600' : 'text-amber-600'}>
                  {statusText}
                </p>
                {bot.name === 'Gateway' && (
                  <p className="text-xs text-slate-500">{gateway.message}</p>
                )}
                {bot.name !== 'Gateway' && !hasDirectMapping && (
                  <p className="text-xs text-slate-500">Set {bot.key} to map this bot to a specific OpenClaw agent id.</p>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
