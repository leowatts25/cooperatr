'use client';
import Link from 'next/link';

const sectors = [
  { icon: '🌾', name: 'Agri-food & Agri-tech' },
  { icon: '☀️', name: 'Renewable Energy' },
  { icon: '💧', name: 'Water Technology' },
  { icon: '♻️', name: 'Circular Economy & ESG' },
  { icon: '⛏️', name: 'Critical Minerals' },
];

const modules = [
  { num: '01', icon: '🔍', name: 'Opportunity Engine', description: 'AI monitors EU, bilateral, and multilateral funding pipelines daily and surfaces matched opportunities before deadlines hit.', href: '/opportunities', live: true },
  { num: '02', icon: '📝', name: 'Proposal Development', description: 'Drafts technical, financial, and compliance sections calibrated to each funder evaluation criteria — in hours, not weeks.', href: '/proposals', live: false },
  { num: '03', icon: '🔎', name: 'Partner Vetting', description: 'Automated CSDDD and sanctions screening for every consortium partner — meeting the due diligence standards EU funders require.', href: '/partners', live: false },
  { num: '04', icon: '📊', name: 'Project Management', description: 'From award to closeout: milestone tracking, financial reporting, and M&E in one place.', href: '/projects', live: false },
  { num: '05', icon: '📋', name: 'Reporting & Verification', description: 'Generates donor-compliant impact reports mapped to GRI, CSRD, and SDG frameworks automatically from your project data.', href: '/reports', live: false },
];

const missed = [
  'A Global Gateway tender for your sector closes this month — and most Andalusian companies will never know it existed.',
  'AECID has €592M to deploy in 2026 across West Africa and Latin America, in sectors where Andalusian companies have a direct advantage.',
  'Development finance organisations that previously worked with USAID are actively seeking new European implementing partners.',
  'The next CDTI deadline is in 6 weeks. Applications take 4. It helps to start early.',
];

const objections = [
  { q: 'EU grants feel complex and bureaucratic', a: 'We handle the process end to end — compliance, application, follow-up. Our platform pre-qualifies your company so we focus on opportunities you can realistically win.' },
  { q: 'We do not know how to find international contracts', a: 'That is exactly what the Opportunity Engine is for. It scans EU, bilateral, multilateral, and foundation pipelines daily and surfaces relevant matches automatically.' },
  { q: 'We have never worked with EU funders before', a: 'Most Andalusian SMEs have not. We include entry-level pathways — subcontracting roles, technical assistance contracts — designed for companies entering the market for the first time.' },
  { q: 'We do not have capacity to manage complex projects', a: 'Our Project Management and Reporting modules handle the compliance burden — milestone tracking, M&E, donor reports — so your team can focus on delivery.' },
];

export default function Dashboard() {
  return (
    <div style={{ fontFamily: "DM Sans, sans-serif" }}>

      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(rgba(15,22,35,0.72), rgba(15,22,35,0.62)), url(https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1800&q=80) center/cover no-repeat',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', textAlign: 'center', padding: '80px 32px',
      }}>
        <div style={{ maxWidth: '900px' }}>
          <p style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '3px', textTransform: 'uppercase', color: 'rgba(240,237,230,0.6)', marginBottom: '28px' }}>
            COOPERATR — Seville, Andalusia
          </p>
          <h1 className="font-serif" style={{ fontSize: 'clamp(38px, 6vw, 72px)', color: '#F5F0E8', lineHeight: 1.1, marginBottom: '28px', letterSpacing: '-1px' }}>
            We connect your company to{' '}
            <span style={{ borderBottom: '3px solid #F0A500', paddingBottom: '2px' }}>new markets worldwide</span>
            {' '}and the funding to get there.
          </h1>
          <p style={{ fontSize: 'clamp(16px, 2vw, 19px)', color: 'rgba(245,240,232,0.72)', lineHeight: 1.7, maxWidth: '640px', margin: '0 auto 40px' }}>
            AI-powered opportunity identification and end-to-end project delivery — built for Andalusian companies ready to access EU, multilateral, and international development finance.
          </p>
          <Link href="/opportunities">
            <button style={{ backgroundColor: '#fff', color: '#1A2332', fontWeight: '700', fontSize: '16px', padding: '16px 36px', borderRadius: '4px', border: 'none', cursor: 'pointer', marginBottom: '12px' }}>
              Find my opportunities
            </button>
          </Link>
          <p style={{ fontSize: '12px', color: 'rgba(245,240,232,0.35)', marginBottom: '48px' }}>No upfront cost. You pay only when you win a contract.</p>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
            {sectors.map(s => (
              <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '40px', backgroundColor: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', fontSize: '13px', color: 'rgba(245,240,232,0.85)' }}>
                <span>{s.icon}</span><span>{s.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ backgroundColor: '#F7F5F0', padding: '80px 32px' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}>
          <p style={{ fontSize: '12px', fontWeight: '700', color: '#8B6914', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '16px' }}>The market is moving quickly</p>
          <h2 className="font-serif" style={{ fontSize: 'clamp(26px, 4vw, 42px)', color: '#1A2332', lineHeight: 1.25, marginBottom: '48px' }}>
            There is more opportunity here than most companies realise.
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', textAlign: 'left' }}>
            {missed.map((text, i) => (
              <div key={i} style={{ display: 'flex', gap: '14px', alignItems: 'flex-start', backgroundColor: '#fff', border: '1px solid #E8E2D8', borderRadius: '8px', padding: '20px 24px' }}>
                <span style={{ color: '#C8860A', fontSize: '18px', flexShrink: 0 }}>→</span>
                <p style={{ fontSize: '15px', color: '#4A5568', lineHeight: 1.65, margin: 0 }}>{text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1px', backgroundColor: '#D4CFC6' }}>
        {[
          { value: '€400B+', label: 'EU Global Gateway committed through 2027' },
          { value: '$40B+', label: 'Former USAID annual programming now seeking new partners' },
          { value: '47', label: 'Funding instruments indexed' },
          { value: '12', label: 'Priority geographies covered' },
        ].map(s => (
          <div key={s.label} style={{ backgroundColor: '#F7F5F0', padding: '32px', textAlign: 'center' }}>
            <div className="font-serif" style={{ fontSize: '32px', color: '#C8860A', marginBottom: '4px' }}>{s.value}</div>
            <div style={{ fontSize: '11px', color: '#8A8070', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ backgroundColor: '#fff', padding: '80px 32px' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '56px' }}>
            <p style={{ fontSize: '12px', fontWeight: '700', color: '#8B6914', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '12px' }}>The Platform</p>
            <h2 className="font-serif" style={{ fontSize: 'clamp(26px, 4vw, 42px)', color: '#1A2332', marginBottom: '16px' }}>Five modules. One integrated platform.</h2>
            <p style={{ color: '#718096', fontSize: '16px', maxWidth: '520px', margin: '0 auto', lineHeight: 1.7 }}>From spotting a funding opportunity to filing the final impact report — no other tool integrates the full development project lifecycle.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
            {modules.map((m) => (
              <Link key={m.href} href={m.href} style={{ textDecoration: 'none' }}>
                <div style={{ backgroundColor: '#F7F5F0', border: '1px solid #E8E2D8', borderRadius: '8px', padding: '28px', height: '100%', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <span style={{ fontSize: '11px', color: '#A09080', fontWeight: '600', letterSpacing: '1px' }}>{m.num}</span>
                    {m.live
                      ? <span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 8px', borderRadius: '20px', backgroundColor: '#FEF3C7', color: '#92400E', border: '1px solid #FCD34D' }}>LIVE</span>
                      : <span style={{ fontSize: '10px', fontWeight: '500', padding: '2px 8px', borderRadius: '20px', backgroundColor: '#F0EDE8', color: '#A09080', border: '1px solid #D4CFC6' }}>COMING SOON</span>
                    }
                  </div>
                  <div style={{ fontSize: '28px', marginBottom: '14px' }}>{m.icon}</div>
                  <h3 className="font-serif" style={{ fontSize: '19px', color: '#1A2332', marginBottom: '10px' }}>{m.name}</h3>
                  <p style={{ fontSize: '13px', color: '#718096', lineHeight: 1.65 }}>{m.description}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div style={{ backgroundColor: '#F7F5F0', padding: '80px 32px' }}>
        <div style={{ maxWidth: '860px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '48px' }}>
            <p style={{ fontSize: '12px', fontWeight: '700', color: '#8B6914', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '12px' }}>Common questions</p>
            <h2 className="font-serif" style={{ fontSize: 'clamp(24px, 3vw, 38px)', color: '#1A2332' }}>Questions we hear often.</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {objections.map((item, i) => (
              <div key={i} style={{ backgroundColor: '#fff', border: '1px solid #E8E2D8', borderRadius: '8px', padding: '24px' }}>
                <p style={{ fontSize: '14px', fontWeight: '700', color: '#1A2332', marginBottom: '10px', lineHeight: 1.4 }}>{item.q}</p>
                <p style={{ fontSize: '13px', color: '#718096', lineHeight: 1.65 }}>{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ backgroundColor: '#1A2332', padding: '80px 32px', textAlign: 'center' }}>
        <h2 className="font-serif" style={{ fontSize: 'clamp(26px, 4vw, 48px)', color: '#F5F0E8', marginBottom: '16px', lineHeight: 1.2 }}>See what is available for your company.</h2>
        <p style={{ color: 'rgba(245,240,232,0.6)', fontSize: '17px', maxWidth: '460px', margin: '0 auto 36px', lineHeight: 1.7 }}>Enter your company profile and get a real AI-powered preview of matched funding opportunities in under two minutes.</p>
        <Link href="/opportunities">
          <button style={{ backgroundColor: '#F0A500', color: '#1A2332', fontWeight: '700', fontSize: '17px', padding: '18px 44px', borderRadius: '4px', border: 'none', cursor: 'pointer' }}>
            Get my free opportunity preview
          </button>
        </Link>
        <p style={{ fontSize: '12px', color: 'rgba(245,240,232,0.3)', marginTop: '14px' }}>No upfront cost. No commitment. You pay only when you win.</p>
      </div>

    </div>
  );
}