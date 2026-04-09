'use client';

import { useState } from 'react';

const moduleAgents = [
  {
    name: 'Opportunity Engine',
    role: 'EU Development Finance Specialist',
    module: 'Module 1',
    description: 'Monitors EU, bilateral, and multilateral procurement portals to identify funding opportunities matched to your sector, geography, and organizational profile.',
    expertise: ['EU TED portal', 'EUROPEAID/INTPA', 'NDICI-Global Europe', 'Global Gateway', 'AECID/COFIDES/FEDES', 'GIZ, AFD, FCDO', 'World Bank, IDB, AfDB'],
    icon: '🔍',
    color: '#F0A500',
    status: 'active',
  },
  {
    name: 'Proposal Writer',
    role: 'EU Proposal Development Specialist',
    module: 'Module 2',
    description: 'Generates competitive technical, financial, and compliance sections calibrated to specific funder evaluation criteria.',
    expertise: ['EU evaluation criteria', 'Logframe methodology', 'Budget templates', 'Technical narratives', 'Theory of change', 'Consortium structuring'],
    icon: '📝',
    color: '#60A5FA',
    status: 'active',
  },
  {
    name: 'Compliance Screener',
    role: 'EU Regulatory Compliance Specialist',
    module: 'Module 3',
    description: 'Automates partner due diligence across sanctions screening, CSDDD, GDPR, and human rights due diligence frameworks.',
    expertise: ['EU CSDDD', 'Sanctions lists (EU, UN, OFAC, UK)', 'GDPR compliance', 'UN Guiding Principles', 'EU Taxonomy', 'AML screening'],
    icon: '🛡️',
    color: '#22C55E',
    status: 'active',
  },
  {
    name: 'Project Advisor',
    role: 'International Development PM Specialist',
    module: 'Module 4',
    description: 'Generates project structures from awarded proposals — milestones, work breakdown, and donor reporting schedules.',
    expertise: ['EU project cycle management', 'Milestone planning', 'Risk registers', 'Donor reporting cycles', 'Procurement compliance', 'Stakeholder management'],
    icon: '📊',
    color: '#8B5CF6',
    status: 'active',
  },
  {
    name: 'MEL Analyst',
    role: 'Monitoring, Evaluation & Learning Specialist',
    module: 'Module 5',
    description: 'Designs indicator frameworks, tracks implementation data, and generates donor-compliant impact reports.',
    expertise: ['GRI Standards', 'EU CSRD/ESRS', 'SDG indicators', 'EFRAG guidance', 'Impact measurement', 'Data quality assurance'],
    icon: '📋',
    color: '#EC4899',
    status: 'active',
  },
];

const sectorAgents = [
  {
    name: 'Agri-food & Agri-tech',
    region: 'Vietnam, West Africa, South Asia',
    description: 'EU-funded agricultural development, sustainable value chains, food security instruments, and smallholder market access.',
    expertise: ['DeSIRA+', 'EDFI AgriFI', 'Better Cotton', 'Precision irrigation', 'Carbon credits in agriculture'],
    icon: '🌾',
    color: '#84CC16',
    status: 'active',
  },
  {
    name: 'Renewable Energy',
    region: 'Sub-Saharan Africa, Latin America',
    description: 'Global Gateway solar electrification, green hydrogen programming, and clean energy access projects.',
    expertise: ['Global Gateway solar', 'Green hydrogen', 'Off-grid deployment', 'Clean cooking', 'EBRD/EIB co-financing'],
    icon: '⚡',
    color: '#F59E0B',
    status: 'active',
  },
  {
    name: 'Water Technology',
    region: 'Latin America, North Africa, Sahel',
    description: 'AECID water programs, desalination, irrigation efficiency, and watershed governance.',
    expertise: ['AECID water/sanitation', 'Plan Trifinio', 'Desalination', 'Community irrigation', 'Smart irrigation'],
    icon: '💧',
    color: '#06B6D4',
    status: 'active',
  },
  {
    name: 'Circular Economy & ESG',
    region: 'EU-wide, Latin America, West Africa',
    description: 'CSDDD compliance advisory, EU Taxonomy alignment, and circular economy programming.',
    expertise: ['CSDDD reporting', 'EU Taxonomy', 'EPR compliance', 'Plastic Credit Exchange', 'ESG diagnostics'],
    icon: '♻️',
    color: '#10B981',
    status: 'active',
  },
  {
    name: 'Critical Minerals & Mining',
    region: 'Andalusia, Sub-Saharan Africa, Latin America',
    description: 'EU Critical Raw Materials Act financing, responsible mining, and ASM governance.',
    expertise: ['CRMA financing', 'Iberian Pyrite Belt', 'ASM governance', 'Supply chain traceability', 'EBRD green transition'],
    icon: '⛏️',
    color: '#A855F7',
    status: 'active',
  },
];

interface AgentInfo {
  name: string;
  role?: string;
  region?: string;
  description: string;
  expertise: string[];
  icon: string;
  color: string;
  status: string;
  module?: string;
}

function AgentCard({ agent, expanded, onToggle }: { agent: AgentInfo; expanded: boolean; onToggle: () => void }) {
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
            <span style={{ fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--text-primary)' }}>{agent.name}</span>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: agent.status === 'active' ? '#22C55E' : '#7A90A8',
              display: 'inline-block',
            }} />
          </div>
          <div style={{ fontSize: 13, color: agent.color, marginBottom: 6 }}>
            {'role' in agent ? agent.role : agent.region}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>{agent.description}</div>

          {expanded && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                Expertise
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {agent.expertise.map((item, i) => (
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
  const [expandedModule, setExpandedModule] = useState<number | null>(0);
  const [expandedSector, setExpandedSector] = useState<number | null>(null);

  return (
    <div style={{ padding: '32px 24px', maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 40 }}>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 32, color: 'var(--text-primary)', marginBottom: 8 }}>
          AI Agents
        </h1>
        <p style={{ fontSize: 16, color: 'var(--text-muted)', lineHeight: 1.6, maxWidth: 700 }}>
          Cooperatr deploys specialized AI agents across every module of the platform. Each agent brings deep domain expertise
          to identify opportunities, write proposals, screen partners, manage projects, and measure impact.
        </p>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          marginTop: 16, padding: '8px 16px', borderRadius: 8,
          background: '#22C55E12', border: '1px solid #22C55E33',
        }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22C55E' }} />
          <span style={{ fontSize: 13, color: '#22C55E', fontWeight: 600 }}>
            {moduleAgents.length + sectorAgents.length} agents active
          </span>
        </div>
      </div>

      {/* Module Agents */}
      <div style={{ marginBottom: 48 }}>
        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 22, color: 'var(--text-primary)', marginBottom: 20 }}>
          Platform Agents
        </h2>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 20 }}>
          One specialist per module — powering the full project lifecycle from opportunity to impact.
        </p>
        <div style={{ display: 'grid', gap: 12 }}>
          {moduleAgents.map((agent, i) => (
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
          Sector Specialists
        </h2>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 20 }}>
          Deep domain knowledge activated based on your sector and geography — layered on top of platform agents.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 12 }}>
          {sectorAgents.map((agent, i) => (
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
          Cooperatr agents are built on responsible AI principles — human judgement remains in the loop at every decision point.
          All agents operate on transparent, auditable data sources aligned with EU AI Act requirements.
        </div>
      </div>
    </div>
  );
}
