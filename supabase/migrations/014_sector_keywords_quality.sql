-- ============================================================================
-- Migration 014 — sector keyword expansion + BD pipeline quality reset
-- ============================================================================
-- Three things happen here:
--
-- 1. Sector keyword expansion
--    The original keywords (migration 010) were generic English terms. They
--    worked for text keyword matching but missed the vocabulary that actually
--    appears in development-finance TA contract titles and descriptions
--    (technical assistance, capacity building, sector reform, etc.).
--    This update adds TA/dev-finance oriented terms to each sector.
--
-- 2. BD pipeline reset
--    The first ~2000 TED tenders ingested were EU domestic commercial
--    procurement (Polish electricity supply, Italian water utilities, Czech
--    construction works). The filter bug (value_inRange-only, no sector gate)
--    let them all through. The discovery + match pipeline then scored them,
--    producing 147 matches that make zero sense for cooperatr's dev-finance
--    use case.
--
--    Fix: mark all TED tenders passes_filter=false and delete all tender_matches.
--    New ingests with the fixed filter (both sector + dev-finance gate required)
--    will rebuild the pipeline from scratch over the next 2 weeks of cron runs.
--
-- 3. (Optional) SAM.gov and EU F&T portal tenders will be added as those
--    ingesters come online — they require no schema changes.
-- ============================================================================

-- ─── 1. Expand sector keywords ───────────────────────────────────────────────

update sectors set keywords = array[
  -- original core terms
  'agriculture', 'agribusiness', 'food security', 'rural development', 'farming',
  'agri-tech', 'agroecology', 'smallholder', 'value chain agriculture', 'livestock',
  'aquaculture',
  -- TA/dev-finance vocabulary
  'agricultural development', 'food systems', 'nutrition', 'rural livelihoods',
  'food value chain', 'agro-processing', 'irrigation scheme', 'fisheries',
  'value chain development', 'food security program', 'land tenure',
  'agricultural productivity', 'rural infrastructure', 'market access',
  'climate-smart agriculture', 'agroforestry', 'post-harvest'
] where slug = 'agri_food';

update sectors set keywords = array[
  -- original
  'solar', 'wind', 'renewable energy', 'photovoltaic', 'biomass', 'hydro',
  'geothermal', 'energy access', 'off-grid', 'mini-grid', 'clean energy',
  'energy transition',
  -- TA/dev-finance vocabulary
  'rural electrification', 'solar home systems', 'energy sector reform',
  'power sector', 'clean cooking', 'biogas', 'energy efficiency program',
  'sustainable energy', 'electrification', 'energy poverty',
  'distributed energy', 'grid extension', 'energy storage',
  'renewable energy project', 'clean energy project'
] where slug = 'renewable_energy';

update sectors set keywords = array[
  -- original
  'water', 'sanitation', 'wastewater', 'irrigation', 'desalination', 'wash',
  'water resources', 'hydrology', 'water supply',
  -- TA/dev-finance vocabulary
  'water sector', 'water governance', 'water management', 'integrated water',
  'water supply system', 'sanitation services', 'water quality', 'groundwater',
  'water user association', 'basin management', 'drinking water',
  'water and sanitation', 'water infrastructure', 'sewage treatment',
  'watershed', 'water utility', 'water policy'
] where slug = 'water_tech';

update sectors set keywords = array[
  -- original
  'circular economy', 'recycling', 'waste management', 'sustainability', 'esg',
  'eu taxonomy', 'green economy', 'climate finance', 'green transition',
  -- TA/dev-finance vocabulary
  'environmental management', 'natural resource management', 'biodiversity',
  'climate adaptation', 'climate resilience', 'land degradation', 'deforestation',
  'redd+', 'ecosystem services', 'environmental impact assessment', 'eia',
  'pollution control', 'hazardous waste', 'solid waste', 'urban environment',
  'plastic waste', 'e-waste', 'environmental compliance', 'green finance',
  'carbon markets', 'climate change adaptation', 'nature-based solutions'
] where slug = 'circular_esg';

update sectors set keywords = array[
  -- original
  'critical raw materials', 'rare earth', 'lithium', 'cobalt', 'mining',
  'strategic minerals', 'battery materials', 'crm',
  -- TA/dev-finance vocabulary
  'extractive industries', 'artisanal mining', 'asgm', 'mining governance',
  'eiti', 'mineral resources', 'oil and gas', 'hydrocarbons', 'mining sector',
  'responsible sourcing', 'supply chain minerals', 'battery supply chain',
  'geological survey', 'natural resources governance', 'resource curse',
  'mining rights', 'mineral policy'
] where slug = 'critical_minerals';

update sectors set keywords = array[
  -- original
  'human rights', 'gender', 'civil society', 'rule of law', 'democracy',
  'rights-based', 'hrdd', 'migration', 'protection', 'equality',
  -- TA/dev-finance vocabulary
  'governance', 'anti-corruption', 'judicial reform', 'electoral support',
  'public administration reform', 'decentralization', 'social cohesion',
  'displacement', 'refugee', 'accountability', 'transparency', 'open government',
  'electoral assistance', 'parliament', 'constitution', 'transitional justice',
  'peacebuilding', 'conflict prevention', 'social protection', 'labour rights',
  'child protection', 'gbv', 'gender-based violence', 'inclusion', 'disability',
  'access to justice', 'legal reform', 'public sector reform', 'tax reform',
  'public finance management', 'pfm', 'corruption', 'accountability mechanisms'
] where slug = 'human_rights';

-- ─── 2. BD pipeline reset ────────────────────────────────────────────────────

-- Remove all tender_matches — they were scored against domestic EU procurement
-- that slipped through the broken filter. The pipeline will rebuild correctly
-- once the EU F&T portal and SAM.gov ingesters are live.
delete from tender_matches;

-- Mark every existing TED tender as failing the filter. New ingests will
-- re-evaluate the last 2 days with the fixed filter (sector match + dev-finance
-- gate both required). Historical TED backfill can be done manually if needed.
update tenders
set passes_filter = false,
    filter_reasons = array_append(filter_reasons, 'reset:014_migration')
where source = 'TED';

-- Also clear discovery candidates that existed only to serve the (now-deleted)
-- bad matches. Keep scouted_companies rows — they represent real firms that may
-- be useful for future tenders (especially once EU F&T portal is live).
-- (No scouted_company rows deleted — they're reusable.)
