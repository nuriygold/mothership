import { listCampaignsByStatus } from './services/campaigns';
import { isDispatchBackedCampaign, startDispatchBackedCampaign } from './dispatch-bridge';
import { isNonRunnableDemoCampaign, legacyDurableOpsEnabled, LEGACY_DURABLE_OPS_DISABLED_MESSAGE } from './legacy-durable-ops';
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
    if (isDispatchBackedCampaign(c)) {
      await record(c.id, 'execution_resumed', 'Engine rehydrated campaign after restart', {
        previousStatus: c.status,
      });
      const resume = startDispatchBackedCampaign(c.id);
      void resume.catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        void record(c.id, 'execution_failed', `Rehydration failed: ${msg}`, {});
      });
      resumed += 1;
      continue;
    }

    if (isNonRunnableDemoCampaign(c) || !legacyDurableOpsEnabled()) {
      await record(
        c.id,
        'campaign_updated',
        isNonRunnableDemoCampaign(c)
          ? 'Engine skipped non-runnable demo campaign during restart recovery'
          : `Engine skipped legacy durable campaign during restart recovery: ${LEGACY_DURABLE_OPS_DISABLED_MESSAGE}`,
        { previousStatus: c.status },
      );
      continue;
    }

    await record(c.id, 'execution_resumed', 'Engine rehydrated legacy durable campaign after restart', {
      previousStatus: c.status,
      legacyFallback: true,
    });
    const resume = runCampaign(c.id);
    void resume.catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      void record(c.id, 'execution_failed', `Rehydration failed: ${msg}`, {});
    });
    resumed += 1;
  }
  return { resumed };
}
