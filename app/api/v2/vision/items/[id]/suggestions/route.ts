import { ensureV2Authorized } from '@/lib/v2/auth';
import { getVisionItemWithLinks } from '@/lib/services/vision';
import { publishV2Event } from '@/lib/v2/event-bus';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const authError = ensureV2Authorized(req);
  if (authError) return authError;
  try {
    const item = await getVisionItemWithLinks(params.id);
    if (!item) {
      return Response.json({ error: { code: 'NOT_FOUND', message: 'Vision item not found' } }, { status: 404 });
    }

    const streamId = `vision-suggestions:${params.id}`;

    // Fire-and-forget: build the Emerald prompt and stream results
    (async () => {
      try {
        const pillarLabel = item.pillar?.label ?? 'General';
        const prompt = [
          `You are helping advance a personal vision goal.`,
          `Vision item: ${item.title}`,
          item.description ? `Description: ${item.description}` : '',
          `Life area (pillar): ${pillarLabel}`,
          item.campaignLinks.length > 0
            ? `Linked campaigns (${item.campaignLinks.length} active)`
            : 'No campaigns linked yet',
          item.financePlanLinks.length > 0
            ? `Linked finance plans (${item.financePlanLinks.length} active)`
            : 'No finance plans linked yet',
          ``,
          `Suggest 2-3 concrete next actions to meaningfully advance this vision goal.`,
          `Each suggestion must be something an AI agent can execute or a specific human action.`,
          `Return JSON only: {"suggestions": [{"text": "...", "actionType": "campaign|finance_plan|task|note"}]}`,
        ]
          .filter(Boolean)
          .join('\n');

        // Publish a "thinking" event immediately so the UI can show the loading state
        publishV2Event(streamId, 'emerald.thinking', { streamId });

        // Dispatch to Emerald via OpenClaw and parse the response
        const { dispatchToOpenClaw } = await import('@/lib/services/openclaw');
        const raw = await dispatchToOpenClaw('emerald', prompt);

        // Extract JSON from the response
        const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
        const jsonStr = jsonMatch?.[1] ?? raw;
        const parsed = JSON.parse(jsonStr.trim()) as {
          suggestions: Array<{ text: string; actionType: string }>;
        };

        const suggestions = (parsed.suggestions ?? []).map((s, i) => ({
          id: `${streamId}:${i}`,
          text: s.text,
          actionType: (s.actionType ?? 'note') as 'campaign' | 'finance_plan' | 'task' | 'note',
        }));

        publishV2Event(streamId, 'emerald.suggestions', { streamId, suggestions });
      } catch {
        publishV2Event(streamId, 'emerald.error', { streamId, error: 'Emerald could not generate suggestions' });
      }
    })();

    return Response.json({ streamId });
  } catch (error) {
    return Response.json(
      { error: { code: 'SUGGESTIONS_FAILED', message: error instanceof Error ? error.message : 'Failed' } },
      { status: 500 }
    );
  }
}
