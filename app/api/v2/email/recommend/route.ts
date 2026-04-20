import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type EmailBucket =
  | 'ON_FIRE'
  | 'BUSINESS'
  | 'FINANCIAL'
  | 'MY_PEOPLE'
  | 'FUN_EVENTS'
  | 'SHOPPING_GIFTS'
  | 'TECH_PROJECTS'
  | 'GOOD_READS'
  | 'TRAVEL';

type EmailRecommendation = {
  bucket: EmailBucket;
  reasoning: string;
  details?: {
    suggestedTimes?: string[];
    draftReply?: string;
    taskTitle?: string;
  };
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email } = body;

    if (!email || !email.subject) {
      return NextResponse.json({ error: 'Email data required' }, { status: 400 });
    }

    const prompt = `Classify this email into exactly one life-area bucket.

EMAIL:
From: ${email.sender}
Subject: ${email.subject}
Preview: ${email.snippet || email.preview || 'N/A'}
Date: ${new Date(email.timestamp).toLocaleString()}

BUCKETS:
- ON_FIRE: Urgent, time-sensitive, needs attention today
- BUSINESS: Work, clients, contracts, professional correspondence
- FINANCIAL: Bills, invoices, payments, banking, investments, receipts
- MY_PEOPLE: Real emails from real humans — friends, family, personal relationships
- FUN_EVENTS: Parties, social events, invitations, RSVPs, outings
- SHOPPING_GIFTS: Orders, shipping, deals, product recommendations, gift ideas
- TECH_PROJECTS: Developer tools, GitHub, SaaS apps, tech newsletters, side projects, tech events
- GOOD_READS: General newsletters, articles, reading material, content subscriptions
- TRAVEL: Flights, hotels, itineraries, booking confirmations, trip planning

Respond with ONLY a JSON object (no markdown, no explanation):
{
  "bucket": "BUSINESS",
  "reasoning": "Brief explanation",
  "confidence": "HIGH",
  "details": {
    "draftReply": "Optional draft reply if MY_PEOPLE or BUSINESS",
    "suggestedTimes": ["Optional time slots if FUN_EVENTS meeting/calendar invite"],
    "taskTitle": "Optional task title if BUSINESS or TECH_PROJECTS"
  }
}

Confidence: HIGH = very clear, MEDIUM = reasonable guess, LOW = uncertain.`;

    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const apiKey = process.env.AZURE_OPENAI_API_KEY;
    const model = process.env.AZURE_OPENAI_MODEL || 'gpt-5.4-mini';

    if (!endpoint || !apiKey) {
      throw new Error('Azure OpenAI not configured');
    }

    const response = await fetch(`${endpoint}openai/responses?api-version=2025-04-01-preview`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: 'You are an expert email classifier. Respond only with valid JSON, no markdown.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 300,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Azure OpenAI error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    const aiOutput = data.choices?.[0]?.message?.content || '';

    let recommendation: EmailRecommendation;
    try {
      const jsonMatch = aiOutput.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found in response');
      recommendation = JSON.parse(jsonMatch[0]);
    } catch {
      console.error('[email:recommend] Failed to parse AI response:', aiOutput);
      recommendation = { bucket: 'BUSINESS', reasoning: 'Could not classify', confidence: 'LOW' };
    }

    return NextResponse.json({
      ok: true,
      recommendation: { emailId: email.id, ...recommendation },
    });
  } catch (err) {
    console.error('[email:recommend]', err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
