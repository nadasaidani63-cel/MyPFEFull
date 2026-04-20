import { Resend } from "resend";
 
let resend = null;
 
function getResend() {
  if (resend) return resend;
 
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
 
  resend = new Resend(apiKey);
  return resend;
}
 
export async function sendEmail({ to, subject, text, html }) {
  const client = getResend();
  const from = process.env.EMAIL_FROM || "onboarding@resend.dev";
 
  if (!client) {
    console.warn("⚠️ Email skipped: RESEND_API_KEY not configured.");
    return { ok: false, skipped: true };
  }
 
  // En mode test Resend (sans domaine vérifié), rediriger vers l'adresse de test
  const forceTo = process.env.FORCE_EMAIL_TO;
  const recipient = forceTo ? forceTo : to;
 
  try {
    const { data, error } = await client.emails.send({
      from,
      to: Array.isArray(recipient)
        ? recipient
        : String(recipient).split(",").map((x) => x.trim()).filter(Boolean),
      subject,
      text,
      html,
    });
 
    if (error) {
      console.error("❌ Email send failed:", error.message || error);
      return { ok: false, error };
    }
 
    console.log(`✅ Email sent to ${recipient} (original: ${to})`);
    return { ok: true, data };
  } catch (err) {
    console.error("❌ Email send failed:", err?.message || err);
    return { ok: false, error: err };
  }
}