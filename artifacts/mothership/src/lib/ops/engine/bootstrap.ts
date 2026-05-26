import { listCampaignsByStatus } from './services/campaigns';
import { isDispatchBackedCampaign, startDispatchBackedCampaign } from './dispatch-bridge';
import { runCampaign } from './runtime';
import { registerDefaultTools } from './tools/adapters';
import { record } from './services/events';

let booted = false;

export async function bootstrap(): Promise<{ resumed: number }> {
  if (booted) return { resumed: 0 };
  booted = true;

  registerDefaultTools();

  const candidates = await listCampaignsByStatus(['running', 'queued']);
  let resumed = 0;
  for (const c of candidates) {
    await record(c.id, 'execution_resumed', 'Engine rehydrated campaign after restart', {
      previousStatus: c.status,
    });
    const resume = isDispatchBackedCampaign(c)
      ? startDispatchBackedCampaign(c.id)
      : runCampaign(c.id);
    void resume.catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      void record(c.id, 'execution_failed', `Rehydration failed: ${msg}`, {});
    });
    resumed += 1;
  }
  return { resumed };
}
