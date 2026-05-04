'use client';

import { useTranslation } from '@/app/lib/i18n/context';

export default function PrivacyPage() {
  const { locale } = useTranslation();
  return (
    <article style={{ maxWidth: '760px', margin: '0 auto', padding: '64px 32px', fontFamily: 'DM Sans, sans-serif', color: '#1A2332', lineHeight: 1.7, fontSize: '15px' }}>
      {locale === 'es' ? <SpanishPrivacy /> : <EnglishPrivacy />}
    </article>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-serif" style={{ fontSize: '22px', marginTop: '40px', marginBottom: '12px', color: '#1A2332' }}>
      {children}
    </h2>
  );
}

function EnglishPrivacy() {
  return (
    <>
      <h1 className="font-serif" style={{ fontSize: '36px', marginBottom: '8px', lineHeight: 1.2 }}>Privacy Policy</h1>
      <p style={{ color: '#718096', fontSize: '13px', marginBottom: '24px' }}>Last updated: May 2026</p>

      <p>
        This privacy policy explains how Cooperatr — operated by <strong>Paradise Street Capital, S.L.U.</strong> (in
        constitution; pending registration at the Registro Mercantil de Sevilla) — collects, uses, and protects personal
        data when you use cooperatr.com and related services. We comply with Regulation (EU) 2016/679 (GDPR) and the
        Spanish Organic Law 3/2018 (LOPDGDD).
      </p>

      <SectionHeading>1. Data controller</SectionHeading>
      <p>
        Paradise Street Capital, S.L.U. (in constitution) — Seville, Andalusia, Spain. Until the entity is fully
        registered, the founder Leo Watts acts as data controller in personal capacity. Contact:
        {' '}<a href="mailto:privacy@cooperatr.com">privacy@cooperatr.com</a>.
      </p>

      <SectionHeading>2. What we collect</SectionHeading>
      <ul>
        <li><strong>Account data:</strong> email address, authentication tokens (via Supabase magic link or password).</li>
        <li><strong>Company profile:</strong> sector, capabilities, geography, certifications, and any free-text descriptions you submit.</li>
        <li><strong>AI interaction data:</strong> prompts, generated outputs, and the company-profile context passed to AI agents.</li>
        <li><strong>Local browser storage:</strong> language preference (<code>cooperatr_locale</code>) and current company identifier (<code>cooperatr_companyId</code>). These never leave your device.</li>
        <li><strong>Server logs:</strong> IP, user-agent, timestamps for security and abuse prevention.</li>
      </ul>

      <SectionHeading>3. Purposes and legal bases</SectionHeading>
      <ul>
        <li>Providing the platform and AI-generated outputs — <em>contractual necessity</em> (Art. 6.1.b GDPR).</li>
        <li>Authentication and account security — <em>contractual necessity</em> (Art. 6.1.b) and <em>legitimate interest</em> (Art. 6.1.f).</li>
        <li>Service improvement and analytics — <em>legitimate interest</em> (Art. 6.1.f).</li>
        <li>Legal and tax compliance — <em>legal obligation</em> (Art. 6.1.c).</li>
      </ul>

      <SectionHeading>4. Sub-processors and international transfers</SectionHeading>
      <p>We use the following processors. As of this policy date, both involve transfers of personal data to the United States.</p>
      <ul>
        <li>
          <strong>Supabase Inc.</strong> (database, authentication). Project currently hosted in <strong>AWS us-east-1 (Virginia, USA)</strong>.
          We are evaluating a migration to an EU region. Until that migration is complete, transfers rely on the EU-U.S. Data Privacy Framework
          and Standard Contractual Clauses where applicable.
        </li>
        <li>
          <strong>Anthropic, PBC</strong> (AI inference for the agent platform). Inference occurs in U.S. AWS regions.
          Transfers rely on Standard Contractual Clauses and the EU-U.S. Data Privacy Framework. We do not send personal data
          beyond what is necessary to generate the requested project concepts and proposals.
        </li>
      </ul>
      <p>
        We are actively working towards EU-only data residency for both database storage and AI inference; status will be
        disclosed transparently as the migration progresses.
      </p>

      <SectionHeading>5. Retention</SectionHeading>
      <ul>
        <li>Account data: until you request deletion or close the account.</li>
        <li>AI prompts and outputs: linked to your account; deleted on account closure unless retained for legal obligations.</li>
        <li>Server logs: 12 months.</li>
        <li>Tax and accounting records: 6 years (Spanish Commercial Code Art. 30).</li>
      </ul>

      <SectionHeading>6. Your rights</SectionHeading>
      <p>
        You have the right to access, rectify, erase, restrict, port, and object to processing of your personal data. To exercise
        any of these rights, email <a href="mailto:privacy@cooperatr.com">privacy@cooperatr.com</a>. You also have the right to
        lodge a complaint with the Spanish Data Protection Agency (AEPD) at{' '}
        <a href="https://www.aepd.es" target="_blank" rel="noopener noreferrer">www.aepd.es</a>.
      </p>

      <SectionHeading>7. Cookies and similar technologies</SectionHeading>
      <p>
        We do not use third-party analytics, advertising, or tracking pixels. The cookies and storage used are strictly
        necessary for the service to function: an authentication cookie set by Supabase, and two browser-local items
        (<code>cooperatr_locale</code>, <code>cooperatr_companyId</code>). No consent banner is required for strictly
        necessary cookies under Spanish AEPD guidance.
      </p>

      <SectionHeading>8. Automated decisions and AI transparency</SectionHeading>
      <p>
        Cooperatr uses AI agents to generate project concepts, proposals, and partner risk analyses. These outputs are
        decision-support, not automated decisions in the sense of Art. 22 GDPR — a human user always reviews and selects
        before any external action is taken. AI outputs are grounded in cited sources and the platform records which sources
        informed each output for audit purposes, in line with the EU AI Act transparency requirements.
      </p>

      <SectionHeading>9. Changes</SectionHeading>
      <p>
        We will publish material changes to this policy on this page with an updated date. For substantive changes, we will
        notify registered users by email.
      </p>
    </>
  );
}

function SpanishPrivacy() {
  return (
    <>
      <h1 className="font-serif" style={{ fontSize: '36px', marginBottom: '8px', lineHeight: 1.2 }}>Política de Privacidad</h1>
      <p style={{ color: '#718096', fontSize: '13px', marginBottom: '24px' }}>Última actualización: mayo de 2026</p>

      <p>
        Esta política de privacidad explica cómo Cooperatr — operado por <strong>Paradise Street Capital, S.L.U.</strong>
        (en constitución; pendiente de inscripción en el Registro Mercantil de Sevilla) — recoge, utiliza y protege los datos
        personales cuando se usa cooperatr.com y los servicios asociados. Cumplimos con el Reglamento (UE) 2016/679 (RGPD) y
        la Ley Orgánica 3/2018 (LOPDGDD).
      </p>

      <SectionHeading>1. Responsable del tratamiento</SectionHeading>
      <p>
        Paradise Street Capital, S.L.U. (en constitución) — Sevilla, Andalucía, España. Hasta la inscripción registral plena,
        el fundador Leo Watts actúa como responsable del tratamiento a título personal. Contacto:
        {' '}<a href="mailto:privacy@cooperatr.com">privacy@cooperatr.com</a>.
      </p>

      <SectionHeading>2. Qué datos recogemos</SectionHeading>
      <ul>
        <li><strong>Datos de cuenta:</strong> dirección de correo electrónico y credenciales de autenticación (via enlace mágico o contraseña a través de Supabase).</li>
        <li><strong>Perfil de empresa:</strong> sector, capacidades, geografía, certificaciones y cualquier descripción libre que aportes.</li>
        <li><strong>Datos de interacción con IA:</strong> instrucciones (prompts), salidas generadas y el contexto de perfil de empresa que se transmite a los agentes de IA.</li>
        <li><strong>Almacenamiento local del navegador:</strong> preferencia de idioma (<code>cooperatr_locale</code>) e identificador de empresa actual (<code>cooperatr_companyId</code>). No salen de tu dispositivo.</li>
        <li><strong>Registros de servidor:</strong> IP, user-agent y marcas de tiempo, con fines de seguridad y prevención de abuso.</li>
      </ul>

      <SectionHeading>3. Finalidades y bases jurídicas</SectionHeading>
      <ul>
        <li>Prestación de la plataforma y generación de salidas de IA — <em>ejecución del contrato</em> (Art. 6.1.b RGPD).</li>
        <li>Autenticación y seguridad de la cuenta — <em>ejecución del contrato</em> (Art. 6.1.b) e <em>interés legítimo</em> (Art. 6.1.f).</li>
        <li>Mejora del servicio y analítica interna — <em>interés legítimo</em> (Art. 6.1.f).</li>
        <li>Cumplimiento legal y fiscal — <em>obligación legal</em> (Art. 6.1.c).</li>
      </ul>

      <SectionHeading>4. Encargados del tratamiento y transferencias internacionales</SectionHeading>
      <p>Utilizamos los siguientes encargados. A fecha de esta política, ambos implican transferencias de datos personales a los Estados Unidos.</p>
      <ul>
        <li>
          <strong>Supabase Inc.</strong> (base de datos y autenticación). Proyecto alojado actualmente en{' '}
          <strong>AWS us-east-1 (Virginia, EE. UU.)</strong>. Estamos evaluando una migración a una región de la UE.
          Hasta entonces, las transferencias se sustentan en el Marco de Privacidad de Datos UE-EE. UU. y, cuando proceda,
          en Cláusulas Contractuales Tipo.
        </li>
        <li>
          <strong>Anthropic, PBC</strong> (inferencia de IA para la plataforma de agentes). La inferencia ocurre en regiones
          AWS de EE. UU. Las transferencias se sustentan en Cláusulas Contractuales Tipo y el Marco de Privacidad UE-EE. UU.
          No enviamos más datos personales que los necesarios para generar los conceptos y propuestas solicitados.
        </li>
      </ul>
      <p>
        Estamos trabajando activamente para alcanzar residencia de datos exclusivamente en la UE, tanto en almacenamiento
        como en inferencia de IA; el estado de esta migración se comunicará de forma transparente conforme avance.
      </p>

      <SectionHeading>5. Conservación</SectionHeading>
      <ul>
        <li>Datos de cuenta: hasta que solicites su supresión o cierres la cuenta.</li>
        <li>Prompts y salidas de IA: vinculados a tu cuenta; suprimidos al cerrar la cuenta salvo obligaciones legales.</li>
        <li>Registros de servidor: 12 meses.</li>
        <li>Documentación contable y fiscal: 6 años (Art. 30 Código de Comercio).</li>
      </ul>

      <SectionHeading>6. Tus derechos</SectionHeading>
      <p>
        Tienes derecho a acceder, rectificar, suprimir, limitar, portar y oponerte al tratamiento de tus datos personales.
        Para ejercerlos, escribe a <a href="mailto:privacy@cooperatr.com">privacy@cooperatr.com</a>. Asimismo, puedes
        presentar una reclamación ante la Agencia Española de Protección de Datos (AEPD) en{' '}
        <a href="https://www.aepd.es" target="_blank" rel="noopener noreferrer">www.aepd.es</a>.
      </p>

      <SectionHeading>7. Cookies y tecnologías similares</SectionHeading>
      <p>
        No utilizamos analítica de terceros, publicidad ni píxeles de seguimiento. Las cookies y almacenamiento usados son
        estrictamente necesarios para el funcionamiento del servicio: una cookie de autenticación de Supabase y dos elementos
        de almacenamiento local del navegador (<code>cooperatr_locale</code>, <code>cooperatr_companyId</code>). Conforme a
        la guía de la AEPD, las cookies estrictamente necesarias no requieren consentimiento.
      </p>

      <SectionHeading>8. Decisiones automatizadas y transparencia de IA</SectionHeading>
      <p>
        Cooperatr utiliza agentes de IA para generar conceptos de proyecto, propuestas y análisis de riesgo de socios. Las
        salidas son apoyo a la decisión, no decisiones automatizadas en el sentido del Art. 22 RGPD: un usuario humano
        siempre revisa y selecciona antes de cualquier acción externa. Las salidas de IA se fundamentan en fuentes citadas y
        la plataforma registra qué fuentes informaron cada salida con fines de auditoría, en línea con los requisitos de
        transparencia de la Ley de IA de la UE.
      </p>

      <SectionHeading>9. Cambios</SectionHeading>
      <p>
        Publicaremos cambios materiales en esta página con la fecha actualizada. Para cambios sustantivos, notificaremos a
        los usuarios registrados por correo electrónico.
      </p>
    </>
  );
}
