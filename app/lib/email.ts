// ============================================================================
// Transactional email via Resend (REST API — no SDK dependency).
// Requires RESEND_API_KEY. Sender is EMAIL_FROM (must be on a Resend-verified
// domain to send to arbitrary recipients); falls back to Resend's test sender.
// ============================================================================

export async function sendEmail(opts: { to: string; subject: string; html: string; replyTo?: string }): Promise<{ ok: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: 'RESEND_API_KEY not set' };
  const from = process.env.EMAIL_FROM || 'Cooperatr <onboarding@resend.dev>';
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: opts.to, subject: opts.subject, html: opts.html, ...(opts.replyTo ? { reply_to: opts.replyTo } : {}) }),
    });
    if (!res.ok) { const t = await res.text().catch(() => ''); return { ok: false, error: `Resend ${res.status}: ${t.slice(0, 200)}` }; }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// Branded onboarding email for a client's CEO login.
export function clientInviteEmail(opts: { clientName: string; loginUrl: string; email: string; password: string | null }): { subject: string; html: string } {
  const { clientName, loginUrl, email, password } = opts;
  const passRow = password
    ? `<tr><td style="padding:6px 0;color:#6b7280">Temporary password</td><td style="padding:6px 0;font-family:monospace;font-weight:700;color:#111827">${password}</td></tr>`
    : '';
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;color:#111827">
  <div style="font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#1f6cc5;margin-bottom:8px">Cooperatr · Client portal</div>
  <h1 style="font-size:22px;margin:0 0 12px">Your ${clientName} funding portal is ready</h1>
  <p style="font-size:15px;line-height:1.6;color:#374151">We've set up a private portal where you can see the funding opportunities we've matched to ${clientName}'s capabilities — ranked by fit, updated as new ones come in.</p>
  <table style="font-size:14px;margin:14px 0;border-collapse:collapse">
    <tr><td style="padding:6px 0;color:#6b7280;width:150px">Sign in at</td><td style="padding:6px 0"><a href="${loginUrl}" style="color:#1f6cc5;font-weight:600">${loginUrl}</a></td></tr>
    <tr><td style="padding:6px 0;color:#6b7280">Email</td><td style="padding:6px 0;font-weight:600">${email}</td></tr>
    ${passRow}
  </table>
  ${password ? `<p style="font-size:13px;color:#6b7280">You can change this password after signing in.</p>` : ''}
  <p style="font-size:14px;line-height:1.6;color:#374151;margin-top:16px">Any questions on an opportunity — just reply and we'll walk you through it.</p>
  <p style="font-size:13px;color:#9ca3af;margin-top:24px">— The Cooperatr team</p>
</div>`;
  return { subject: `Your ${clientName} funding portal is ready`, html };
}
