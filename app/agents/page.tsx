'use client';

import { useState } from 'react';
import { useTranslation, type TranslationKey } from '@/app/lib/i18n/context';

interface AgentSpec {
  nameKey: TranslationKey;
  roleKey: TranslationKey;
  descKey: TranslationKey;
  expertiseKey: TranslationKey;
  icon: string;
  color: string;
}

const moduleAgentSpecs: AgentSpec[] = [
  { nameKey: 'agents.mod.opp.name', roleKey: 'agents.mod.opp.role', descKey: 'agents.mod.opp.desc', expertiseKey: 'agents.mod.opp.expertise', icon: '🔍', color: '#F0A500' },
  { nameKey: 'agents.mod.proposal.name', roleKey: 'agents.mod.proposal.role', descKey: 'agents.mod.proposal.desc', expertiseKey: 'agents.mod.proposal.expertise', icon: '📝', color: '#60A5FA' },
  { nameKey: 'agents.mod.compliance.name', roleKey: 'agents.mod.compliance.role', descKey: 'agents.mod.compliance.desc', expertiseKey: 'agents.mod.compliance.expertise', icon: '🛡️', color: '#22C55E' },
  { nameKey: 'agents.mod.project.name', roleKey: 'agents.mod.project.role', descKey: 'agents.mod.project.desc', expertiseKey: 'agents.mod.project.expertise', icon: '📊', color: '#8B5CF6' },
  { nameKey: 'agents.mod.mel.name', roleKey: 'agents.mod.mel.role', descKey: 'agents.mod.mel.desc', expertiseKey: 'agents.mod.mel.expertise', icon: '📋', color: '#EC4899' },
];

const sectorAgentSpecs: AgentSpec[] = [
  { nameKey: 'agents.sec.agrifood.name', roleKey: 'agents.sec.agrifood.region', descKey: 'agents.sec.agrifood.desc', expertiseKey: 'agents.sec.agrifood.expertise', icon: '🌾', color: '#84CC16' },
  { nameKey: 'agents.sec.energy.name', roleKey: 'agents.sec.energy.region', descKey: 'agents.sec.energy.desc', expertiseKey: 'agents.sec.energy.expertise', icon: '⚡', color: '#F59E0B' },
  { nameKey: 'agents.sec.water.name', roleKey: 'agents.sec.water.region', descKey: 'agents.sec.water.desc', expertiseKey: 'agents.sec.water.expertise', icon: '💧', color: '#06B6D4' },
  { nameKey: 'agents.sec.circular.name', roleKey: 'agents.sec.circular.region', descKey: 'agents.sec.circular.desc', expertiseKey: 'agents.sec.circular.expertise', icon: '♻️', color: '#10B981' },
  { nameKey: 'agents.sec.minerals.name', roleKey: 'agents.sec.minerals.region', descKey: 'agents.sec.minerals.desc', expertiseKey: 'agents.sec.minerals.expertise', icon: '⛏️', color: '#A855F7' },
];

function AgentCard({ agent, expanded, onToggle }: { agent: AgentSpec; expanded: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  const expertiseList = t(agent.expertiseKey).split('|').map(s => s.trim()).filter(Boolean);
  return (
    <div
      onClick={onToggle}
      style={{
        background: 'var(--bg-surface)',
        borderRadius: 16,
        padding: 24,
        border: `1px solid ${expanded ? agent.color + '44' : 'var(--border)'}`,
        cursor: 'pointer',
        transition: 'all 0.2s',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Subtle gradient accent */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 3,
        background: `linear-gradient(90deg, ${agent.color}, transparent)`,
        opacity: expanded ? 1 : 0.4,
        transition: 'opacity 0.2s',
      }} />

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12,
          background: `${agent.color}15`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 24, flexShrink: 0,
        }}>
          {agent.icon}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--text-primary)' }}>{t(agent.nameKey)}</span>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: '#22C55E',
              display: 'inline-block',
            }} />
          </div>
          <div style={{ fontSize: 13, color: agent.color, marginBottom: 6 }}>
            {t(agent.roleKey)}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>{t(agent.descKey)}</div>

          {expanded && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                {t('agents.expertise')}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {expertiseList.map((item, i) => (
                  <span key={i} style={{
                    padding: '4px 10px', borderRadius: 6,
                    background: `${agent.color}12`, color: agent.color,
                    fontSize: 12, fontWeight: 500,
                  }}>
                    {item}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AgentsPage() {
  const { t } = useTranslation();
  const [expandedModule, setExpandedModule] = useState<number | null>(0);
  const [expandedSector, setExpandedSector] = useState<number | null>(null);

  return (
    <div style={{ padding: '32px 24px', maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 40 }}>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 32, color: 'var(--text-primary)', marginBottom: 8 }}>
          {t('agents.title')}
        </h1>
        <p style={{ fontSize: 16, color: 'var(--text-muted)', lineHeight: 1.6, maxWidth: 700 }}>
          {t('agents.subtitle')}
        </p>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          marginTop: 16, padding: '8px 16px', borderRadius: 8,
          background: '#22C55E12', border: '1px solid #22C55E33',
        }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22C55E' }} />
          <span style={{ fontSize: 13, color: '#22C55E', fontWeight: 600 }}>
            {moduleAgentSpecs.length + sectorAgentSpecs.length} {t('agents.active')}
          </span>
        </div>
      </div>

      {/* Module Agents */}
      <div style={{ marginBottom: 48 }}>
        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 22, color: 'var(--text-primary)', marginBottom: 20 }}>
          {t('agents.platformAgents')}
        </h2>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 20 }}>
          {t('agents.platformDesc')}
        </p>
        <div style={{ display: 'grid', gap: 12 }}>
          {moduleAgentSpecs.map((agent, i) => (
            <AgentCard
              key={i}
              agent={agent}
              expanded={expandedModule === i}
              onToggle={() => setExpandedModule(expandedModule === i ? null : i)}
            />
          ))}
        </div>
      </div>

      {/* Sector Agents */}
      <div style={{ marginBottom: 48 }}>
        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 22, color: 'var(--text-primary)', marginBottom: 20 }}>
          {t('agents.sectorAgents')}
        </h2>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 20 }}>
          {t('agents.sectorDesc')}
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 12 }}>
          {sectorAgentSpecs.map((agent, i) => (
            <AgentCard
              key={i}
              agent={agent}
              expanded={expandedSector === i}
              onToggle={() => setExpandedSector(expandedSector === i ? null : i)}
            />
          ))}
        </div>
      </div>

      {/* Bottom note */}
      <div style={{
        background: 'var(--bg-surface)',
        borderRadius: 12,
        padding: 24,
        border: '1px solid var(--border)',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          {t('agents.responsibleNote')}
        </div>
      </div>
    </div>
  );
}
