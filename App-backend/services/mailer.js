import nodemailer from "nodemailer";

function bool(v) {
  if (v === undefined || v === null) return false;
  const s = String(v).toLowerCase().trim();
  return ["1", "true", "yes", "y", "on"].includes(s);
}

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT || 465);
  const secure = process.env.SMTP_SECURE ? bool(process.env.SMTP_SECURE) : port === 465;

  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    // Transport not configured - we will SKIP sending to avoid crashing the backend.
    return null;
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });

  return transporter;
}

/**
 * Send an email. If SMTP is not configured, it will NOT throw and will return { skipped: true }.
 */
export async function sendEmail({ to, subject, text, html }) {
  const t = getTransporter();
  const from = process.env.EMAIL_FROM || process.env.SMTP_USER;

  if (!t || !from) {
    console.warn("⚠️  Email skipped: SMTP not configured. Set SMTP_USER/SMTP_PASS (and optionally EMAIL_FROM).");
    return { ok: false, skipped: true };
  }

  try {
    const info = await t.sendMail({
      from,
      to,
      subject,
      text,
      html,
    });
    return { ok: true, info };
  } catch (err) {
    // Never crash the server because of email failure
    console.error("❌ Email send failed:", err?.message || err);
    return { ok: false, error: err };
  }
}
