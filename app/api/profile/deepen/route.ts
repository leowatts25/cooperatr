import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

export const maxDuration = 60;

// ============================================================================
// Stage 2: Conversational profile deepening
// ============================================================================
// The user optionally goes through 4–6 targeted questions that unlock higher
// quality ideas. The model decides what to ask next based on what's missing,
// then returns a final structured profile patch that the client merges into
// the existing company profile before re-running the discovery engine.
// ============================================================================

const SYSTEM_PROMPT = `You are Cooperatr's Profile Coach. Your job is to run a short, high-signal conversation with a European SME to deepen their profile so the Discovery Engine can generate sharper ideas.

You ask ONE question at a time. Each question should unlock information that would meaningfully change the ideas we could generate. Do not ask generic small-talk — every question must be strategic.

## Topics to cover (pick whichever are still thin)
- capabilities: what the company can actually deliver (technical, operational)
- certifications: ISO, B-Corp, EU procurement codes, sector-specific (organic, FairTrade, etc.)
- team_size: headcount, especially technical / field-ready staff
- existing_partners: who they've already worked with (informal or formal)
- key_customers: biggest / most strategic clients
- typical_project_size: what budget range they're comfortable executing
- three_year_vision: where the founder wants to be
- cash_runway: how long they can carry upfront costs (critical for grants that reimburse)
- consortium_posture: happy to lead vs prefer to join as junior partner
- international_contacts: diaspora, embassies, trade attachés, alumni networks

## Conversation rules
1. Start by acknowledging the profile you've seen in 1 sentence.
2. Ask ONE question per turn. Keep it short.
3. When the user answers, extract what you learned and decide the next question.
4. After 4–6 useful answers (or when the user says "done" / "that's all"), stop asking and emit the final structured patch.
5. Be warm but direct. Use tú (informal) if the conversation is in Spanish.

## Response format
Always respond with a JSON object. No markdown fences, no prose outside the JSON.

During the conversation:
{
  "mode": "ask",
  "message": "Your next question or brief acknowledgement",
  "topic": "which topic this question is probing"
}

When you have enough (or user says done):
{
  "mode": "done",
  "message": "Brief closing line",
  "patch": {
    "capabilities": ["..."],
    "certifications": ["..."],
    "teamSize": "...",
    "existingPartners": ["..."],
    "keyCustomers": ["..."],
    "typicalProjectSize": "...",
    "threeYearVision": "...",
    "cashRunway": "...",
    "consortiumPosture": "...",
    "internationalContacts": ["..."],
    "profileCompleteness": 75
  }
}

Only include patch fields you actually learned. Set profileCompleteness between 30 and 95 based on how much you gathered.`;

type Message = { role: 'user' | 'assistant'; content: string };

export async function POST(req: NextRequest) {
  try {
    const { profile, messages } = (await req.json()) as {
      profile: Record<string, unknown>;
      messages: Message[];
    };

    // Seed the first turn with a system-side framing of the known profile
    const framing = `Existing profile snapshot:
Name: ${profile.companyName || 'Unnamed'}
Sector: ${profile.sector || 'Not specified'}
Organization type: ${profile.organizationType || 'Not specified'}
Revenue: ${profile.revenueRange || 'Not specified'}
Geographies: ${Array.isArray(profile.geographies) ? (profile.geographies as string[]).join(', ') : 'Not specified'}
Prior EU experience: ${profile.priorEUExperience ? 'Yes' : 'No'}
Description: ${profile.description || 'Not provided'}`;

    const conversationMessages: Message[] =
      messages.length === 0
        ? [{ role: 'user', content: framing + '\n\nStart the conversation.' }]
        : [{ role: 'user', content: framing }, ...messages];

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: conversationMessages,
    });

    const raw = response.content[0].type === 'text' ? response.content[0].text : '';

    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      throw new Error('Model did not return JSON: ' + raw.slice(0, 200));
    }
    const parsed = JSON.parse(raw.slice(start, end + 1));

    return NextResponse.json(parsed);
  } catch (error) {
    console.error('Profile deepen error:', error);
    return NextResponse.json(
      {
        error: 'Failed to deepen profile',
        detail: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
