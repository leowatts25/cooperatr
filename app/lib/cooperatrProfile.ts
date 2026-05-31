// ============================================================================
// Cooperatr profile — the grounding for tender-fit (Stage 1) and the
// needs-us recalibration (Stage 2).
// ============================================================================
// This is the authoritative, hard-coded description of WHAT COOPERATR DOES and
// WHO IT SERVES, distilled from the founder's CV and the business plan. The
// tender-fit stage scores incoming tenders against this; the matcher uses the
// needs-us lists to penalize firms that don't need an intermediary.
//
// Sources:
//   - Founder CV (Leo Watts): Winrock Private Sector Engagement, Solarium
//     Group, proposal wins across DO/VN/IN/BD/JM/SV/GT/Sahel/MZ/DRC/UA, langs
//     ES/PT/FR, sectors agriculture / clean energy / CTIP / capacity building /
//     circular economy / conservation / sustainable finance / carbon.
//   - COOPERATR business plan: forgotten-market thesis (SMEs/NGOs that can't
//     access funding), priority sectors, deal bands, named big-consultancy
//     competitors that do NOT need Cooperatr.
// ============================================================================

export interface DealBand {
  floorUsd: number;       // below this: uneconomic / not worth a bid
  homeMinUsd: number;     // start of the comfortable lead-bid range
  sweetSpotUsd: number;   // the ideal deal size
  homeMaxUsd: number;     // top of the comfortable lead-bid range
  consortiumMaxUsd: number; // acceptable only with a consortium
  ceilingUsd: number;     // hard cap — can't realistically lead above this
}

// €→USD framed loosely; the pipeline normalizes to USD. The plan is stated in
// euros (€50k–€1M start, €500k sweet, €2–3M with consortium). We use round
// USD-equivalent bands (~1.08x) and keep the existing $5M ceiling from filter.ts.
export const DEAL_BAND: DealBand = {
  floorUsd: 20_000,
  homeMinUsd: 50_000,
  sweetSpotUsd: 540_000,    // ~€500k
  homeMaxUsd: 1_100_000,    // ~€1M
  consortiumMaxUsd: 3_250_000, // ~€3M, only with a consortium
  ceilingUsd: 5_000_000,
};

// Priority sectors (slugs match the `sectors` table). human_rights and
// capacity_building are both founder competencies.
export const PROFILE_SECTORS = [
  'agri_food',
  'renewable_energy',
  'water_tech',
  'circular_esg',
  'critical_minerals',
  'human_rights',
  'capacity_building',
] as const;

// Founder geography, tiered by evidence strength. Used by tender-fit to score
// geography_fit: a tender in a core-delivery country scores higher than one in
// a country we only reach linguistically, which beats a country with no signal.
export const FOUNDER_GEO = {
  // Proven delivery — proposal wins / designed partnerships (CV-backed).
  core: [
    'Dominican Republic', 'Vietnam', 'India', 'Bangladesh', 'Jamaica',
    'El Salvador', 'Guatemala', 'Burkina Faso', 'Mozambique',
    'Democratic Republic of Congo', 'Bolivia', 'Ukraine',
  ],
  // Home base / EU operating context.
  base: ['Spain'],
  // Strong regional familiarity beyond named wins.
  regional: [
    'Latin America', 'Caribbean', 'Sahel', 'West Africa', 'East Africa',
    'Southeast Asia', 'South Asia',
  ],
  // Linguistic reach (ES fluent, PT proficient, FR advanced) → these markets
  // are operationally accessible even without a prior named project.
  linguistic: [
    'Mexico', 'Peru', 'Colombia', 'Chile', 'Argentina', 'Ecuador', 'Honduras',
    'Nicaragua', 'Costa Rica', 'Panama', 'Paraguay', 'Uruguay', 'Brazil',
    'Angola', 'Mali', 'Niger', 'Senegal', "Côte d'Ivoire", 'Morocco',
    'Tunisia', 'Cameroon', 'Madagascar', 'Cape Verde', 'Guinea',
  ],
} as const;

export const FOUNDER_LANGUAGES = ['English (native)', 'Spanish (fluent)', 'Portuguese (proficient)', 'French (advanced)'];

// ----------------------------------------------------------------------------
// Needs-us lists — Stage 2 recalibration
// ----------------------------------------------------------------------------
// The whole Cooperatr value proposition is serving the "forgotten market":
// SMEs and NGOs that can't access donor funding on their own. Firms below
// already know how to win and do NOT need an unknown intermediary — matching
// them is the Accenture bug. These are matched (case-insensitive substring)
// against the candidate company name. A hit caps the match score in the
// skip band.
export const NEEDS_US_EXCLUSIONS = [
  // Global management consultancies / Big Four
  'accenture', 'deloitte', 'kpmg', 'pwc', 'pricewaterhouse', 'ernst & young',
  'ernst and young', ' ey ', 'mckinsey', 'boston consulting', 'bcg', 'bain & company',
  'capgemini', 'ibm consulting', 'guidehouse',
  // Established development primes (named in the business plan)
  'chemonics', 'dai global', 'development alternatives', 'tetra tech',
  'abt associates', 'abt global', 'palladium', 'dt global', 'niras',
  'particip', 'cowater', 'mott macdonald', 'crown agents',
  'adam smith international', 'oxford policy management', 'gopa', 'hulla',
  'cardno', 'rti international', 'fhi 360', 'creative associates',
  'management systems international', 'msi', 'social impact',
  // US federal service contractors (Leo already knows how to work with USG)
  'booz allen', 'leidos', 'saic', 'general dynamics', 'mantech', 'caci',
  'deloitte federal', 'maximus', 'ICF International', 'icf international',
];

// Soft penalty: a candidate is a poor "needs-us" fit if it's clearly large /
// enterprise. The matcher applies judgment, but these size_band tokens hint at
// "doesn't need us" — they want SMEs, not multinationals.
export const ENTERPRISE_SIZE_TOKENS = ['large', 'enterprise', 'multinational', '250+', '500+', '1000+'];

export function isNeedsUsExcluded(companyName: string | null | undefined): boolean {
  if (!companyName) return false;
  const n = ` ${companyName.toLowerCase()} `;
  return NEEDS_US_EXCLUSIONS.some((x) => n.includes(x));
}

// ----------------------------------------------------------------------------
// Prompt block — injected into Stage 1 (tender-fit) and Stage 2 (matcher) so
// the LLM scores against the same profile. Kept compact and cache-friendly.
// ----------------------------------------------------------------------------
export function cooperatrProfileBlock(): string {
  return `## Cooperatr profile (what we do, who we serve)

Cooperatr is a one-person, Spain-based development-finance intermediary. The thesis: a "forgotten market" of SMEs and NGOs can deliver donor-funded work but can't access the funding on their own. Cooperatr finds the tender, finds the SME that fits, and builds the small cross-border coalition that wins it. We are NOT a big consultancy and we do NOT serve big consultancies.

Priority sectors: agri-food & agri-tech; renewable energy & energy access; water & sanitation; circular economy & ESG/climate; critical minerals; human rights & governance; capacity building & institutional strengthening.

Deal band (USD-equivalent of the plan's euro figures):
- Home range: $50k–$1.1M. Sweet spot ~$540k (€500k).
- $1.1M–$3.25M (≈€1–3M): acceptable ONLY if it's an excellent fit AND a consortium is realistic.
- Below $50k: usually uneconomic. Above $5M: out of reach (can't lead).

Founder experience & geography (drives geography_fit):
- Proven delivery (proposal wins / designed partnerships): Dominican Republic, Vietnam, India, Bangladesh, Jamaica, El Salvador, Guatemala, Burkina Faso, Mozambique, DR Congo, Bolivia, Ukraine.
- Base: Spain (EU operating context).
- Regional familiarity: Latin America, Caribbean, Sahel, West/East Africa, Southeast & South Asia.
- Languages: Spanish (fluent), Portuguese (proficient), French (advanced) → all of Latin America, Lusophone Africa, and Francophone Africa are operationally in reach.
- Sector competencies from the CV: agriculture, clean energy, counter-trafficking, capacity building, circular economy, conservation, sustainable/blended finance, carbon.

A tender fits Cooperatr when: (1) it falls in a priority sector, (2) it sits in or near the founder's geographic/linguistic reach (EU-funded work delivered in those regions counts strongly), and (3) it sits in or near the deal band. A US-domestic or EU-domestic commercial procurement with no development-finance angle does NOT fit, even if a keyword matched.`;
}
