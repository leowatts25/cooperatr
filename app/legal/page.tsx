'use client';

import { useTranslation } from '@/app/lib/i18n/context';

export default function LegalNoticePage() {
  const { locale } = useTranslation();
  return (
    <article style={{ maxWidth: '760px', margin: '0 auto', padding: '64px 32px', fontFamily: 'DM Sans, sans-serif', color: '#1A2332', lineHeight: 1.7, fontSize: '15px' }}>
      {locale === 'es' ? <SpanishLegal /> : <EnglishLegal />}
    </article>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: '16px', padding: '10px 0', borderBottom: '1px solid #E8E2D8' }}>
      <span style={{ color: '#718096', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function EnglishLegal() {
  return (
    <>
      <h1 className="font-serif" style={{ fontSize: '36px', marginBottom: '8px', lineHeight: 1.2 }}>Legal Notice</h1>
      <p style={{ color: '#718096', fontSize: '13px', marginBottom: '24px' }}>
        Published in compliance with Article 10 of Spanish Law 34/2002 (LSSI-CE).
      </p>

      <Row label="Trade name" value="Cooperatr" />
      <Row label="Legal entity" value="Paradise Street Capital, S.L.U. (in constitution)" />
      <Row label="Tax ID (CIF/NIF)" value="Pending — to be assigned upon registration with the Spanish Tax Agency" />
      <Row label="Registered office" value="Seville, Andalusia, Spain" />
      <Row label="Mercantile registry" value="Registro Mercantil de Sevilla — registration in process. Name reservation certificate no. 26070931." />
      <Row label="CNAE activity codes" value="7022 (Business management consultancy) · 6202 (Computer consultancy)" />
      <Row label="Founder & sole shareholder" value="Leo Watts (NIE Z3186023E)" />
      <Row label="Contact" value={<a href="mailto:hello@cooperatr.com">hello@cooperatr.com</a>} />

      <h2 className="font-serif" style={{ fontSize: '22px', marginTop: '40px', marginBottom: '12px' }}>Purpose of this site</h2>
      <p>
        cooperatr.com presents Cooperatr&apos;s platform for designing, developing, and executing economic cooperation projects
        addressed to European, multilateral, and post-USAID development finance. Access to the authenticated platform
        is restricted to invited organisations.
      </p>

      <h2 className="font-serif" style={{ fontSize: '22px', marginTop: '40px', marginBottom: '12px' }}>Intellectual property</h2>
      <p>
        The Cooperatr trademark is registered in Spain. Software, content, design, and AI-agent architecture are property of
        Paradise Street Capital, S.L.U. (in constitution) or its licensors. Reproduction or distribution outside the platform
        is not permitted without written authorisation.
      </p>

      <h2 className="font-serif" style={{ fontSize: '22px', marginTop: '40px', marginBottom: '12px' }}>Liability</h2>
      <p>
        AI-generated outputs (project concepts, proposals, partner analyses) are decision-support, not legal, financial, or
        tax advice. Users are responsible for verifying source citations and validating outputs before using them in
        regulated contexts.
      </p>

      <h2 className="font-serif" style={{ fontSize: '22px', marginTop: '40px', marginBottom: '12px' }}>Applicable law</h2>
      <p>
        These conditions are governed by Spanish law. Any dispute will be submitted to the courts of Seville, except where
        Spanish consumer-protection law provides otherwise.
      </p>
    </>
  );
}

function SpanishLegal() {
  return (
    <>
      <h1 className="font-serif" style={{ fontSize: '36px', marginBottom: '8px', lineHeight: 1.2 }}>Aviso Legal</h1>
      <p style={{ color: '#718096', fontSize: '13px', marginBottom: '24px' }}>
        Publicado en cumplimiento del artículo 10 de la Ley 34/2002 de Servicios de la Sociedad de la Información (LSSI-CE).
      </p>

      <Row label="Nombre comercial" value="Cooperatr" />
      <Row label="Razón social" value="Paradise Street Capital, S.L.U. (en constitución)" />
      <Row label="CIF/NIF" value="Pendiente — se asignará tras inscripción ante la Agencia Tributaria" />
      <Row label="Domicilio social" value="Sevilla, Andalucía, España" />
      <Row label="Registro Mercantil" value="Registro Mercantil de Sevilla — inscripción en trámite. Certificación de reserva de denominación nº 26070931." />
      <Row label="CNAE" value="7022 (Otras actividades de consultoría de gestión empresarial) · 6202 (Actividades de consultoría informática)" />
      <Row label="Socio único y fundador" value="Leo Watts (NIE Z3186023E)" />
      <Row label="Contacto" value={<a href="mailto:hello@cooperatr.com">hello@cooperatr.com</a>} />

      <h2 className="font-serif" style={{ fontSize: '22px', marginTop: '40px', marginBottom: '12px' }}>Objeto del sitio</h2>
      <p>
        cooperatr.com presenta la plataforma de Cooperatr para el diseño, desarrollo y ejecución de proyectos de cooperación
        económica dirigidos a financiación europea, multilateral y estadounidense post-USAID. El acceso a la plataforma
        autenticada está reservado a organizaciones invitadas.
      </p>

      <h2 className="font-serif" style={{ fontSize: '22px', marginTop: '40px', marginBottom: '12px' }}>Propiedad intelectual e industrial</h2>
      <p>
        La marca Cooperatr está registrada en España. El software, los contenidos, el diseño y la arquitectura de agentes de
        IA son propiedad de Paradise Street Capital, S.L.U. (en constitución) o de sus licenciantes. No se permite su
        reproducción o distribución fuera de la plataforma sin autorización escrita.
      </p>

      <h2 className="font-serif" style={{ fontSize: '22px', marginTop: '40px', marginBottom: '12px' }}>Responsabilidad</h2>
      <p>
        Las salidas generadas por IA (conceptos de proyecto, propuestas, análisis de socios) constituyen apoyo a la decisión
        y no asesoramiento legal, financiero ni fiscal. El usuario es responsable de verificar las fuentes citadas y validar
        las salidas antes de utilizarlas en contextos regulados.
      </p>

      <h2 className="font-serif" style={{ fontSize: '22px', marginTop: '40px', marginBottom: '12px' }}>Legislación aplicable</h2>
      <p>
        Las presentes condiciones se rigen por la legislación española. Cualquier controversia se someterá a los juzgados y
        tribunales de Sevilla, salvo cuando la normativa de protección al consumidor establezca lo contrario.
      </p>
    </>
  );
}
