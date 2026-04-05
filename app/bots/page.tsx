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

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Bots</h1>
        <p className="text-sm text-slate-500">Operational specialists and orchestration endpoints.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {bots.map((bot) => {
          const configured = Boolean(process.env[bot.key]);
          const status = bot.name === 'Gateway' ? gateway.ok : configured;

          return (
            <Card key={bot.name}>
              <CardTitle>{bot.name}</CardTitle>
              <CardSubtitle>{bot.role}</CardSubtitle>
              <div className="mt-2 text-sm">
                <p className={status ? 'text-emerald-600' : 'text-amber-600'}>
                  {status ? 'Configured' : 'Needs wiring'}
                </p>
                {bot.name === 'Gateway' && (
                  <p className="text-xs text-slate-500">{gateway.message}</p>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
