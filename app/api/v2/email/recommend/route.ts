import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type EmailAction =
  | 'SCHEDULE'
  | 'REPLY'
  | 'RSVP'
  | 'UNSUBSCRIBE'
  | 'DELETE'
  | 'ARCHIVE'
  | 'CREATE_TASK'
  | 'DEFER';

type EmailRecommendation = {
  action: EmailAction;
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

    const prompt = `Analyze this email and recommend the best action to take.

EMAIL DETAILS:
From: ${email.sender}
Subject: ${email.subject}
Preview: ${email.snippet || email.preview || 'N/A'}
Date: ${new Date(email.timestamp).toLocaleString()}

AVAILABLE ACTIONS:
- SCHEDULE: Meeting requests that need calendar coordination
- REPLY: Personal messages that need a response
- RSVP: Event invitations that need attendance confirmation
- UNSUBSCRIBE: Marketing emails with no value
- DELETE: Spam or irrelevant messages
- ARCHIVE: Information to keep but no action needed
- CREATE_TASK: Emails that represent work to be done
- DEFER: Messages to revisit later

Respond with ONLY a JSON object (no markdown, no explanation) in this exact format:
{
  "action": "SCHEDULE",
  "reasoning": "Brief explanation of why this action makes sense",
  "confidence": "HIGH",
  "details": {
    "suggestedTimes": ["Thursday 2pm", "Friday 10am"],
    "draftReply": "Optional draft response text",
    "taskTitle": "Optional task title if CREATE_TASK"
  }
}

Confidence levels:
- HIGH: Very clear what to do (meeting request, obvious spam, etc)
- MEDIUM: Reasonable suggestion but could go either way
- LOW: Not obvious, user should decide

Be concise and practical. Focus on clearing inbox efficiently.`;

    // Call Azure OpenAI
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const apiKey = process.env.AZURE_OPENAI_API_KEY;
    const model = process.env.AZURE_OPENAI_MODEL || 'gpt-5.4-mini';

    if (!endpoint || !apiKey) {
      throw new Error('Azure OpenAI not configured');
    }

    const response = await fetch(`${endpoint}chat/completions`, {
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
            content: 'You are an expert email triage assistant. Respond only with valid JSON, no markdown formatting.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 500,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Azure OpenAI error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    const aiOutput = data.choices?.[0]?.message?.content || '';

    // Parse the AI response
    let recommendation: EmailRecommendation;
    try {
      // Extract JSON from response (might have extra text)
      const jsonMatch = aiOutput.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      recommendation = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error('[email:recommend] Failed to parse AI response:', aiOutput);
      // Fallback to simple classification
      recommendation = {
        action: 'ARCHIVE',
        reasoning: 'Unable to parse AI recommendation',
        confidence: 'LOW',
      };
    }

    return NextResponse.json({
      ok: true,
      recommendation: {
        emailId: email.id,
        ...recommendation,
      },
    });
  } catch (err) {
    console.error('[email:recommend]', err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: errorMessage }, { status: 500 });
  }
}
