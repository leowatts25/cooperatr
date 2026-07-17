'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, ADMIN_EMAIL } from '@/app/lib/supabase-auth';

// ============================================================================
// /admin/clients — the clients you represent. Click one for its own BD view.
// ============================================================================

interface ClientListItem {
  id: string;
  name: string;
  slug: string;
  website: string | null;
  sectors: string[] | null;
  geographies: string[] | null;
  size_band: string | null;
  ceo_name: string | null;
  status: string;
  match_count: number;
  top_score: number;
}

export default function AdminClientsPage() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [clients, setClients] = useState<ClientListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [website, setWebsite] = useState('');
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const fetchClients = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/clients?adminEmail=${encodeURIComponent(ADMIN_EMAIL)}`);
      const data = await res.json();
      setClients(data.clients || []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    async function init() {
      const user = await getCurrentUser();
      if (!user || user.email !== ADMIN_EMAIL) { router.push('/'); return; }
      setIsAdmin(true);
    }
    init();
  }, [router]);
  useEffect(() => { if (isAdmin) fetchClients(); }, [isAdmin, fetchClients]);

  async function addClient() {
    if (!name.trim()) return;
    setAdding(true); setErr(null);
    try {
      const res = await fetch(`/api/admin/clients?adminEmail=${encodeURIComponent(ADMIN_EMAIL)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, website }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'add failed');
      setName(''); setWebsite('');
      await fetchClients();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Add failed'); } finally { setAdding(false); }
  }

  if (!isAdmin) return <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ color: 'var(--text-muted)' }}>Checking access…</div></div>;

  return (
    <div style={{ padding: '32px 24px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 28, color: 'var(--text-primary)', marginBottom: 4 }}>Clients</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>The SMEs you represent. Open a client for a BD scanner view matched to their capabilities.</p>
      </div>

      {/* Add client */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 22, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Client name" style={inputStyle(180)} />
        <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://website.com" style={inputStyle(240)} />
        <button onClick={addClient} disabled={adding || !name.trim()} style={{ padding: '9px 16px', borderRadius: 8, border: 'none', background: adding || !name.trim() ? 'var(--bg-elevated)' : 'var(--accent)', color: adding || !name.trim() ? 'var(--text-muted)' : '#fff', fontSize: 13, fontWeight: 700, cursor: adding ? 'wait' : 'pointer' }}>
          {adding ? 'Researching…' : '+ Add & research'}
        </button>
        {err && <span style={{ fontSize: 12, color: '#EF4444' }}>{err}</span>}
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Adds the client and auto-researches its profile from the web (~30–60s).</span>
      </div>

      {loading ? (
        <div style={{ display: 'grid', gap: 8 }}>{[1, 2, 3].map((i) => <div key={i} style={{ height: 90, background: 'var(--bg-surface)', borderRadius: 12, animation: 'skeleton 1.5s infinite' }} />)}</div>
      ) : clients.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, background: 'var(--bg-surface)', borderRadius: 16, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🏢</div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 18, color: 'var(--text-primary)' }}>No clients yet</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 6 }}>Add one above and I&apos;ll research its profile.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {clients.map((c) => (
            <Link key={c.id} href={`/admin/clients/${c.id}`} style={{ textDecoration: 'none' }}>
              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', cursor: 'pointer' }}>
                <div style={{ flex: 1, minWidth: 260 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{c.name}</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6, alignItems: 'center' }}>
                    {c.size_band && <span style={chip('#F59E0B')}>{c.size_band}</span>}
                    {(c.sectors || []).slice(0, 4).map((s) => <span key={s} style={chip('#EC4899')}>{s.replace(/_/g, ' ')}</span>)}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                    {c.ceo_name ? `CEO: ${c.ceo_name}` : 'CEO —'}{c.geographies?.length ? ` · ${c.geographies.slice(0, 3).join(', ')}` : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: c.top_score >= 65 ? '#22C55E' : c.top_score >= 40 ? '#F59E0B' : 'var(--text-muted)' }}>{c.match_count}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>matches{c.top_score ? ` · top ${c.top_score}` : ''}</div>
                </div>
                <span style={{ color: 'var(--text-muted)', fontSize: 18 }}>→</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function chip(color: string): React.CSSProperties {
  return { fontSize: 10, padding: '2px 8px', borderRadius: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3, background: `${color}20`, color };
}
function inputStyle(w: number): React.CSSProperties {
  return { width: w, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-base)', color: 'var(--text-primary)', fontSize: 13 };
}
