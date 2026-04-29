'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser, ADMIN_EMAIL } from '@/app/lib/supabase-auth';
import { useTranslation, type TranslationKey } from '@/app/lib/i18n/context';

interface UserProfile {
  id: string;
  email: string;
  status: string;
  created_at: string;
  approved_at: string | null;
  approved_by: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  pending: '#F59E0B',
  approved: '#22C55E',
  rejected: '#EF4444',
};

type AdminFilter = 'all' | 'pending' | 'approved' | 'rejected';

const FILTER_LABEL_KEYS: Record<AdminFilter, TranslationKey> = {
  all: 'admin.tab.all',
  pending: 'admin.tab.pending',
  approved: 'admin.tab.approved',
  rejected: 'admin.tab.rejected',
};

const STATUS_LABEL_KEYS: Record<string, TranslationKey> = {
  pending: 'admin.status.pending',
  approved: 'admin.status.approved',
  rejected: 'admin.status.rejected',
};

export default function AdminPage() {
  const router = useRouter();
  const { t, locale } = useTranslation();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [filter, setFilter] = useState<AdminFilter>('all');
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      const user = await getCurrentUser();
      if (!user || user.email !== ADMIN_EMAIL) {
        router.push('/');
        return;
      }
      setIsAdmin(true);
      await fetchUsers();
    }
    init();
  }, [router]);

  async function fetchUsers(statusFilter?: string) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ adminEmail: ADMIN_EMAIL });
      if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter);
      const res = await fetch(`/api/admin/users?${params}`);
      const data = await res.json();
      setUsers(data.users || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  async function updateUser(userId: string, status: string) {
    setUpdating(userId);
    try {
      await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, status, adminEmail: ADMIN_EMAIL }),
      });
      await fetchUsers(filter);
    } catch (err) { console.error(err); }
    finally { setUpdating(null); }
  }

  if (!isAdmin) return (
    <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: 'var(--text-muted)' }}>{t('admin.checkingAccess')}</div>
    </div>
  );

  const pendingCount = users.filter(u => u.status === 'pending').length;
  const dateLocale = locale === 'es' ? 'es-ES' : 'en-GB';

  return (
    <div style={{ padding: '32px 24px', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 28, color: 'var(--text-primary)', marginBottom: 4 }}>{t('admin.title')}</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>{t('admin.subtitle')}</p>
        {pendingCount > 0 && (
          <div style={{ marginTop: 12, padding: '8px 16px', background: '#F59E0B15', border: '1px solid #F59E0B33', borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#F59E0B' }} />
            <span style={{ fontSize: 13, color: '#F59E0B', fontWeight: 600 }}>{pendingCount} {pendingCount > 1 ? t('admin.pendingApprovals') : t('admin.pendingApproval')}</span>
          </div>
        )}
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid var(--border)' }}>
        {(['all', 'pending', 'approved', 'rejected'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => { setFilter(tab); fetchUsers(tab); }}
            style={{
              padding: '12px 20px', background: 'none', border: 'none',
              borderBottom: filter === tab ? '2px solid var(--accent)' : '2px solid transparent',
              color: filter === tab ? 'var(--accent)' : 'var(--text-muted)',
              cursor: 'pointer', fontSize: 14, fontWeight: 600,
            }}
          >
            {t(FILTER_LABEL_KEYS[tab])}
          </button>
        ))}
      </div>

      {/* Users list */}
      {loading ? (
        <div style={{ display: 'grid', gap: 12 }}>
          {[1, 2, 3].map(i => <div key={i} style={{ height: 72, background: 'var(--bg-surface)', borderRadius: 12, animation: 'skeleton 1.5s infinite' }} />)}
        </div>
      ) : users.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, background: 'var(--bg-surface)', borderRadius: 16, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>👥</div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--text-primary)', marginBottom: 8 }}>
            {filter === 'all' ? t('admin.noUsersYet') : `${t('admin.noUsersWithStatus')}: ${t(FILTER_LABEL_KEYS[filter])}`}
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {users.map(user => (
            <div key={user.id} style={{
              background: 'var(--bg-surface)', borderRadius: 12, padding: '16px 20px',
              border: `1px solid ${user.status === 'pending' ? '#F59E0B33' : 'var(--border)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              opacity: updating === user.id ? 0.5 : 1, transition: 'opacity 0.2s',
            }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>{user.email}</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{
                    fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 600, textTransform: 'uppercase',
                    background: `${STATUS_COLORS[user.status] || '#7A90A8'}22`,
                    color: STATUS_COLORS[user.status] || '#7A90A8',
                  }}>
                    {STATUS_LABEL_KEYS[user.status] ? t(STATUS_LABEL_KEYS[user.status]) : user.status}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {t('admin.signedUp')} {new Date(user.created_at).toLocaleDateString(dateLocale, { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                  {user.approved_at && (
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {t('admin.approvedAt')} {new Date(user.approved_at).toLocaleDateString(dateLocale, { day: 'numeric', month: 'short' })}
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {user.status === 'pending' && (
                  <>
                    <button
                      onClick={() => updateUser(user.id, 'approved')}
                      disabled={updating === user.id}
                      style={{ padding: '8px 16px', background: '#22C55E22', color: '#22C55E', border: '1px solid #22C55E44', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
                    >
                      {t('admin.approve')}
                    </button>
                    <button
                      onClick={() => updateUser(user.id, 'rejected')}
                      disabled={updating === user.id}
                      style={{ padding: '8px 16px', background: '#EF444422', color: '#EF4444', border: '1px solid #EF444444', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
                    >
                      {t('admin.reject')}
                    </button>
                  </>
                )}
                {user.status === 'approved' && (
                  <button
                    onClick={() => updateUser(user.id, 'rejected')}
                    disabled={updating === user.id}
                    style={{ padding: '8px 16px', background: 'none', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', fontSize: 12 }}
                  >
                    {t('admin.revoke')}
                  </button>
                )}
                {user.status === 'rejected' && (
                  <button
                    onClick={() => updateUser(user.id, 'approved')}
                    disabled={updating === user.id}
                    style={{ padding: '8px 16px', background: '#22C55E22', color: '#22C55E', border: '1px solid #22C55E44', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
                  >
                    {t('admin.approve')}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
