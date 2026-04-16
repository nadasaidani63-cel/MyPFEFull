import crypto from "crypto";

export function generateEmailVerificationToken() {
  const raw = crypto.randomBytes(32).toString("hex");
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  // default 30 minutes
  const expiresInMin = Number(process.env.EMAIL_VERIFY_EXPIRES_MIN || 30);
  const expires = new Date(Date.now() + expiresInMin * 60_000);
  return { raw, hash, expires };
}

export function hashToken(raw) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}
