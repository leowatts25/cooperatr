// ============================================================================
// Apply migration 014 (sector keyword expansion + BD pipeline reset) via the
// Supabase service-role REST client against the live project (cooperatr-eu).
// 014 is pure DML, so no direct Postgres/DDL access is needed.
//
// Usage: node --env-file=.env.local scripts/apply-014.mjs
// ============================================================================
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
console.log('Target project:', url);
const db = createClient(url, key, { auth: { persistSession: false } });

const SECTOR_KEYWORDS = {
  agri_food: ['agriculture','agribusiness','food security','rural development','farming','agri-tech','agroecology','smallholder','value chain agriculture','livestock','aquaculture','agricultural development','food systems','nutrition','rural livelihoods','food value chain','agro-processing','irrigation scheme','fisheries','value chain development','food security program','land tenure','agricultural productivity','rural infrastructure','market access','climate-smart agriculture','agroforestry','post-harvest'],
  renewable_energy: ['solar','wind','renewable energy','photovoltaic','biomass','hydro','geothermal','energy access','off-grid','mini-grid','clean energy','energy transition','rural electrification','solar home systems','energy sector reform','power sector','clean cooking','biogas','energy efficiency program','sustainable energy','electrification','energy poverty','distributed energy','grid extension','energy storage','renewable energy project','clean energy project'],
  water_tech: ['water','sanitation','wastewater','irrigation','desalination','wash','water resources','hydrology','water supply','water sector','water governance','water management','integrated water','water supply system','sanitation services','water quality','groundwater','water user association','basin management','drinking water','water and sanitation','water infrastructure','sewage treatment','watershed','water utility','water policy'],
  circular_esg: ['circular economy','recycling','waste management','sustainability','esg','eu taxonomy','green economy','climate finance','green transition','environmental management','natural resource management','biodiversity','climate adaptation','climate resilience','land degradation','deforestation','redd+','ecosystem services','environmental impact assessment','eia','pollution control','hazardous waste','solid waste','urban environment','plastic waste','e-waste','environmental compliance','green finance','carbon markets','climate change adaptation','nature-based solutions'],
  critical_minerals: ['critical raw materials','rare earth','lithium','cobalt','mining','strategic minerals','battery materials','crm','extractive industries','artisanal mining','asgm','mining governance','eiti','mineral resources','oil and gas','hydrocarbons','mining sector','responsible sourcing','supply chain minerals','battery supply chain','geological survey','natural resources governance','resource curse','mining rights','mineral policy'],
  human_rights: ['human rights','gender','civil society','rule of law','democracy','rights-based','hrdd','migration','protection','equality','governance','anti-corruption','judicial reform','electoral support','public administration reform','decentralization','social cohesion','displacement','refugee','accountability','transparency','open government','electoral assistance','parliament','constitution','transitional justice','peacebuilding','conflict prevention','social protection','labour rights','child protection','gbv','gender-based violence','inclusion','disability','access to justice','legal reform','public sector reform','tax reform','public finance management','pfm','corruption','accountability mechanisms'],
};

// ── Step 1: expand sector keywords ──────────────────────────────────────────
for (const [slug, keywords] of Object.entries(SECTOR_KEYWORDS)) {
  const { error } = await db.from('sectors').update({ keywords }).eq('slug', slug);
  if (error) { console.error(`sectors[${slug}] FAILED:`, error.message); process.exit(1); }
  console.log(`sectors[${slug}] -> ${keywords.length} keywords`);
}

// ── Step 2: delete all tender_matches (bad matches scored on broken filter) ──
{
  const { count, error } = await db.from('tender_matches').delete({ count: 'exact' }).not('id', 'is', null);
  if (error) { console.error('delete tender_matches FAILED:', error.message); process.exit(1); }
  console.log(`tender_matches deleted: ${count}`);
}

// ── Step 3: reset TED tenders (passes_filter=false) ─────────────────────────
{
  const { count, error } = await db.from('tenders').update({ passes_filter: false }, { count: 'exact' }).eq('source', 'TED');
  if (error) { console.error('reset TED tenders FAILED:', error.message); process.exit(1); }
  console.log(`TED tenders reset (passes_filter=false): ${count}`);
}

console.log('Migration 014 applied successfully.');
