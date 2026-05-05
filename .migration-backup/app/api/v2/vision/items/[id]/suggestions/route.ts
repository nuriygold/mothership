import { getVisionItemWithLinks } from '@/lib/services/vision';

export const dynamic = 'force-dynamic';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const item = await getVisionItemWithLinks(params.id);
    if (!item) {
      return Response.json({ error: { code: 'NOT_FOUND', message: 'Vision item not found' } }, { status: 404 });
    }

    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const apiKey = process.env.AZURE_OPENAI_API_KEY;
    const model = process.env.AZURE_OPENAI_MODEL || 'gpt-4o-mini';

    if (!endpoint || !apiKey) {
      return Response.json({ error: { code: 'NOT_CONFIGURED', message: 'AI not configured' } }, { status: 503 });
    }

    const pillarLabel = item.pillar?.label ?? 'General';
    const prompt = [
      `Vision goal: ${item.title}`,
      item.description ? `Description: ${item.description}` : '',
      `Life area: ${pillarLabel}`,
      item.campaignLinks.length > 0 ? `${item.campaignLinks.length} active campaign(s) linked` : 'No campaigns linked',
      item.financePlanLinks.length > 0 ? `${item.financePlanLinks.length} finance plan(s) linked` : 'No finance plans linked',
      ``,
      `Suggest 2-3 concrete next actions to meaningfully advance this vision goal.`,
      `Each suggestion must be something an AI agent can execute or a specific human action.`,
      `Return ONLY a JSON object (no markdown):`,
      `{"suggestions": [{"text": "...", "actionType": "campaign|finance_plan|task|note"}]}`,
    ].filter(Boolean).join('\n');

    const res = await fetch(`${endpoint}openai/responses?api-version=2025-04-01-preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
      body: JSON.stringify({
        model,
        instructions: 'You are a personal life coach AI. Respond only with valid JSON, no markdown.',
        input: prompt,
        temperature: 0.5,
        max_output_tokens: 400,
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) {
      const text = await res.text();
      return Response.json({ error: { code: 'AI_ERROR', message: `Azure OpenAI error: ${res.status} ${text}` } }, { status: 502 });
    }

    const data = await res.json();
    const aiOutput = data.output?.[0]?.content?.[0]?.text ?? '';

    let parsed: { suggestions: Array<{ text: string; actionType: string }> };
    try {
      const jsonMatch = aiOutput.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON in response');
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      return Response.json({ error: { code: 'PARSE_ERROR', message: 'Could not parse AI response' } }, { status: 502 });
    }

    const suggestions = (parsed.suggestions ?? []).map((s, i) => ({
      id: `${params.id}:suggestion:${i}`,
      text: s.text,
      actionType: (s.actionType ?? 'note') as 'campaign' | 'finance_plan' | 'task' | 'note',
    }));

    return Response.json({ ok: true, suggestions });
  } catch (error) {
    return Response.json(
      { error: { code: 'SUGGESTIONS_FAILED', message: error instanceof Error ? error.message : 'Failed' } },
      { status: 500 }
    );
  }
}
