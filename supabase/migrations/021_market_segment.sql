-- ============================================================================
-- Migration 021 — market segmentation
-- ============================================================================
-- The client portal surfaced that different clients need different sourcing
-- universes: a US-domestic firm (Forward Planning) should match US grants
-- (grants.gov), NOT EU/international dev-finance tenders. A `market` on both
-- tenders and clients routes each client to the right universe.
--
--   'intl_dev'    — EU + post-USAID international development finance (default)
--   'us_domestic' — US federal/state/local + community development funding
-- ============================================================================

alter table tenders  add column if not exists market text not null default 'intl_dev';
alter table clients  add column if not exists market text not null default 'intl_dev';

create index if not exists idx_tenders_market on tenders (market);
create index if not exists idx_clients_market on clients (market);
