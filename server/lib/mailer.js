import nodemailer from 'nodemailer';

let cached = null; // null = not initialized, false = not configured, object = transport

function getTransport() {
  if (cached !== null) return cached;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) { cached = false; return false; }
  cached = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
  return cached;
}

export function mailConfigured() { return !!getTransport(); }

// Send an email. No-ops (returns {skipped:true}) if SMTP isn't configured, so
// callers never break when email is off.
export async function sendMail({ to, subject, html, text }) {
  const t = getTransport();
  if (!t) return { skipped: true };
  const from = process.env.MAIL_FROM || process.env.SMTP_USER;
  await t.sendMail({ from, to, subject, html, text });
  return { sent: true };
}
