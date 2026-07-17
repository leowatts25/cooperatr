import Anthropic from '@anthropic-ai/sdk';

// ============================================================================
// Client research — web-research an SME client from their website into a
// structured Cooperatr profile (capabilities, sectors, geographies, CEO).
// Same web-search + verification pattern as Discovery v2 / funder discovery.
// ============================================================================

const client = new Anthropic({ maxRetries: 4 });

const SECTOR_SLUGS = ['agri_food', 'renewable_energy', 'water_tech', 'circular_esg', 'critical_minerals', 'human_rights', 'capacity_building'];

export interface ClientProfile {
  name: string;
  description: string | null;
  sectors: string[];
  geographies: string[];         // ISO alpha-2 or region names where they deliver
  size_band: string | null;      // micro | small | medium | large
  capabilities: string | null;   // freeform: service lines / technical abilities
  past_wins: string[];
  certifications: string[];
  ceo_name: string | null;
  ceo_background: string | null;  // experience/network — a matching signal
  ceo_linkedin: string | null;
}

const emitTool: Anthropic.Tool = {
  name: 'emit_client_profile',
  description: 'Emit the researched client profile.',
  input_schema: {
    type: 'object',
    required: ['name', 'description', 'sectors', 'capabilities'],
    properties: {
      name: { type: 'string' },
      description: { type: 'string' },
      sectors: { type: 'array', items: { type: 'string', enum: SECTOR_SLUGS } },
      geographies: { type: 'array', items: { type: 'string' } },
      size_band: { type: ['string', 'null'], enum: [...['micro', 'small', 'medium', 'large'], null] },
      capabilities: { type: 'string', description: 'Concrete service lines / technical capabilities, 2-4 sentences.' },
      past_wins: { type: 'array', items: { type: 'string' } },
      certifications: { type: 'array', items: { type: 'string' } },
      ceo_name: { type: ['string', 'null'] },
      ceo_background: { type: ['string', 'null'], description: "CEO/founder experience, sector network and geographic reach — used as a matching signal." },
      ceo_linkedin: { type: ['string', 'null'] },
    },
  },
};

export async function researchClient(input: { name: string; website: string | null }): Promise<ClientProfile | null> {
  const system = `You research an SME so a development-finance BD platform (Cooperatr) can match it to donor-funded tenders.

Cooperatr's sector taxonomy (map to these slugs): agri_food, renewable_energy, water_tech, circular_esg, critical_minerals, human_rights, capacity_building.

USE WEB SEARCH on the company's website and the wider web to extract a factual profile — do NOT invent. Capture:
- what they actually do (concrete service lines / technical capabilities)
- their sectors (mapped to the taxonomy), delivery geographies, rough size band
- named past donor/client wins and certifications, if any
- the CEO/founder: name, and especially their professional BACKGROUND, sector network and geographic reach (this is used as a BD matching signal — where has this person worked, what markets/donors do they know)

If a field isn't findable, leave it null/empty rather than guessing. After researching, call emit_client_profile.`;

  const userPrompt = `Research this client and emit its profile:
Name: ${input.name}
Website: ${input.website || '(unknown — search for it)'}

Search their site + the web, then emit_client_profile.`;

  const webSearchTool = { type: 'web_search_20250305', name: 'web_search', max_uses: 6 } as unknown as Anthropic.Tool;

  let response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    system,
    tools: [webSearchTool, emitTool],
    tool_choice: { type: 'auto' },
    messages: [{ role: 'user', content: userPrompt }],
  });
  let emitBlock = response.content.find((b) => b.type === 'tool_use' && b.name === 'emit_client_profile');

  if (!emitBlock || emitBlock.type !== 'tool_use') {
    response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 3000,
      system,
      tools: [emitTool],
      tool_choice: { type: 'tool', name: 'emit_client_profile' },
      messages: [{ role: 'user', content: userPrompt }],
    });
    emitBlock = response.content.find((b) => b.type === 'tool_use' && b.name === 'emit_client_profile');
  }

  if (!emitBlock || emitBlock.type !== 'tool_use') return null;
  const p = emitBlock.input as Partial<ClientProfile>;
  return {
    name: p.name || input.name,
    description: p.description ?? null,
    sectors: (p.sectors || []).filter((s) => SECTOR_SLUGS.includes(s)),
    geographies: p.geographies || [],
    size_band: p.size_band ?? null,
    capabilities: p.capabilities ?? null,
    past_wins: p.past_wins || [],
    certifications: p.certifications || [],
    ceo_name: p.ceo_name ?? null,
    ceo_background: p.ceo_background ?? null,
    ceo_linkedin: p.ceo_linkedin ?? null,
  };
}
