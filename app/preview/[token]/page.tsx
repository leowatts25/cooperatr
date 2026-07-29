import Link from 'next/link';
import { createServerClient } from '@/app/lib/supabase';

// ============================================================================
// /preview/[token] — the tokenized read-only landing page an outreach email
// links to. No login: the unguessable token IS the access. Shows the prospect
// their hook opportunity + a few other live fits from their market universe,
// with a CTA to activate a real account. First view is stamped for funnel
// tracking.
// ============================================================================

export const dynamic = 'force-dynamic';

interface TenderCard {
  id: string;
  title: string | null;
  donor: string | null;
  buyer: string | null;
  country: string | null;
  value_usd_max: number | null;
  currency: string | null;
  deadline_at: string | null;
  url: string | null;
}

function fmtValue(t: TenderCard): string | null {
  if (!t.value_usd_max) return null;
  const sym = t.currency === 'EUR' ? '€' : '$';
  return `${sym}${Number(t.value_usd_max).toLocaleString('en-US')}`;
}

function Card({ t, hook, rationale }: { t: TenderCard; hook?: boolean; rationale?: string | null }) {
  const value = fmtValue(t);
  return (
    <div style={{
      background: '#FFFFFF', border: hook ? '2px solid #1f6cc5' : '1px solid #E3E9F1',
      borderRadius: 12, padding: 24, textAlign: 'left',
    }}>
      {hook && <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: '#1f6cc5', marginBottom: 10 }}>Top match for you</div>}
      <h3 style={{ fontSize: 17, color: '#17233A', lineHeight: 1.4, margin: '0 0 10px', fontWeight: 700 }}>{t.title || 'Untitled opportunity'}</h3>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 13, color: '#64748B', marginBottom: rationale ? 12 : 0 }}>
        <span>{t.donor || t.buyer || '—'}</span>
        {t.country && <span>· {t.country}</span>}
        {value && <span>· {value}</span>}
        {t.deadline_at && <span>· deadline {String(t.deadline_at).slice(0, 10)}</span>}
      </div>
      {rationale && (
        <p style={{ fontSize: 14, color: '#475569', lineHeight: 1.65, margin: 0, borderTop: '1px solid #E3E9F1', paddingTop: 12 }}>
          <span style={{ fontWeight: 700, color: '#17233A' }}>Why this fits you: </span>{rationale}
        </p>
      )}
    </div>
  );
}

export default async function PreviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = createServerClient();

  const { data: prospect } = await supabase
    .from('prospects')
    .select('id, name, market, match_rationale, preview_viewed_at, hook_tender_id')
    .eq('preview_token', token)
    .maybeSingle();

  if (!prospect) {
    return (
      <div style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'DM Sans, sans-serif' }}>
        <div style={{ textAlign: 'center', color: '#64748B' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
          <p>This preview link isn&apos;t valid anymore.</p>
        </div>
      </div>
    );
  }

  // Stamp first view (funnel signal), fire-and-forget semantics.
  if (!prospect.preview_viewed_at) {
    await supabase.from('prospects').update({ preview_viewed_at: new Date().toISOString() }).eq('id', prospect.id);
  }

  let hookTender: TenderCard | null = null;
  if (prospect.hook_tender_id) {
    const { data } = await supabase
      .from('tenders')
      .select('id, title, donor, buyer, country, value_usd_max, currency, deadline_at, url')
      .eq('id', prospect.hook_tender_id).maybeSingle();
    hookTender = (data as TenderCard) || null;
  }

  const { data: more } = await supabase
    .from('tenders')
    .select('id, title, donor, buyer, country, value_usd_max, currency, deadline_at, url')
    .eq('passes_filter', true)
    .eq('market', prospect.market || 'intl_dev')
    .neq('id', prospect.hook_tender_id || '00000000-0000-0000-0000-000000000000')
    .order('tender_fit_score', { ascending: false, nullsFirst: false })
    .limit(4);

  return (
    <div style={{ fontFamily: 'DM Sans, sans-serif', backgroundColor: '#F6F8FB', minHeight: '100vh' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '64px 24px 80px' }}>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2.5, textTransform: 'uppercase', color: '#64748B', textAlign: 'center', marginBottom: 16 }}>
          Cooperatr · funding preview
        </p>
        <h1 className="font-serif" style={{ fontSize: 'clamp(26px, 4vw, 38px)', color: '#17233A', textAlign: 'center', lineHeight: 1.2, marginBottom: 10 }}>
          Live funding matches for {prospect.name}
        </h1>
        <p style={{ fontSize: 15, color: '#64748B', textAlign: 'center', lineHeight: 1.6, maxWidth: 560, margin: '0 auto 36px' }}>
          We researched your public work and matched it against live cross-border funding opportunities. Here&apos;s what stands out.
        </p>

        <div style={{ display: 'grid', gap: 14 }}>
          {hookTender && <Card t={hookTender} hook rationale={prospect.match_rationale} />}
          {(more as TenderCard[] | null || []).map((t) => <Card key={t.id} t={t} />)}
        </div>

        <div style={{ textAlign: 'center', marginTop: 40, padding: 32, background: '#FFFFFF', border: '1px solid #E3E9F1', borderRadius: 14 }}>
          <h2 className="font-serif" style={{ fontSize: 22, color: '#17233A', marginBottom: 8 }}>Want the full pipeline?</h2>
          <p style={{ fontSize: 14, color: '#64748B', lineHeight: 1.6, maxWidth: 460, margin: '0 auto 20px' }}>
            A free Cooperatr account gives you your own portal: every live opportunity matched to your capabilities, ranked by fit, updated as new funding drops.
          </p>
          <Link href="/auth">
            <button style={{ backgroundColor: '#1f6cc5', color: '#FFFFFF', fontWeight: 700, fontSize: 15, padding: '13px 30px', borderRadius: 8, border: 'none', cursor: 'pointer' }}>
              Create my free account
            </button>
          </Link>
          <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 12 }}>Or just reply to the email that brought you here — a human reads every reply.</p>
        </div>
      </div>
    </div>
  );
}
