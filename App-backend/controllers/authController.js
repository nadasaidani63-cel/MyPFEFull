import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { sendEmail } from "../services/mailer.js";
import { generateEmailVerificationToken, hashToken } from "../services/emailVerification.js";
import {
  buildVerificationEmail,
  buildSignupConfirmationEmail,
  buildLoginSecurityEmail,
  buildPasswordResetEmail,
  buildPasswordResetSuccessEmail,
} from "../services/emailTemplates.js";
import { createAuditLog } from "../services/auditLog.js";

const generateToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });

function isRegistrationAllowed(_email) {
  return true;
}

function getClientIp(req) {
  return req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || null;
}

function splitName(fullName = "") {
  const clean = String(fullName || "").trim().replace(/\s+/g, " ");
  if (!clean) return { firstName: "", lastName: "" };

  const parts = clean.split(" ");
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };

  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts.slice(-1).join(" "),
  };
}

function titleCase(value = "") {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function deriveNamesFromUser(user) {
  const first = String(user.firstName || "").trim();
  const last = String(user.lastName || "").trim();
  if (first && last) return { firstName: first, lastName: last };

  const legacyFullName = String(user.fullName || "").trim();
  if (legacyFullName) {
    const parsed = splitName(legacyFullName);
    return {
      firstName: first || parsed.firstName,
      lastName: last || parsed.lastName,
    };
  }

  const local = String(user.email || "")
    .split("@")[0]
    .replace(/[._-]+/g, " ")
    .trim();
  const parsed = splitName(local || "Utilisateur");
  return {
    firstName: titleCase(first || parsed.firstName || "Utilisateur"),
    lastName: titleCase(last || parsed.lastName || ""),
  };
}

function needsLegacyUpgrade(user) {
  const missingNames = !String(user.firstName || "").trim() || !String(user.lastName || "").trim();
  const legacyUnverified = user.emailVerified === false && !user.emailVerifyTokenHash && !user.emailVerifyExpires;
  return missingNames || legacyUnverified || !String(user.fullName || "").trim();
}

function buildPasswordResetLink(user, rawToken) {
  const web = process.env.APP_WEB_URL || "http://localhost:8080";
  return `${web}/reset-password?token=${rawToken}&email=${encodeURIComponent(user.email)}`;
}

async function sendVerificationEmail(user, rawToken) {
  const web = process.env.APP_WEB_URL || "http://localhost:8080";
  const link = `${web}/verify-email?token=${rawToken}&email=${encodeURIComponent(user.email)}`;
  const email = buildVerificationEmail(user, link);
  return sendEmail({ to: user.email, ...email });
}

async function sendPasswordResetEmail(user, rawToken) {
  const link = buildPasswordResetLink(user, rawToken);
  const email = buildPasswordResetEmail(user, link, rawToken);
  return sendEmail({ to: user.email, ...email });
}

function createPasswordResetToken() {
  const { raw, hash, expires } = generateEmailVerificationToken();
  return { raw, hash, expires };
}

export const register = async (req, res) => {
  try {
    const { email, password, firstName, lastName, phone } = req.body;

    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({ success: false, message: "Email, mot de passe, nom et prénom sont requis." });
    }

    if (!isRegistrationAllowed(email)) {
      return res.status(403).json({
        success: false,
        message: "Inscription refusée. Seules les adresses autorisées peuvent s'inscrire.",
      });
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const exists = await User.findOne({ email: normalizedEmail });
    if (exists) {
      return res.status(400).json({ success: false, message: "Email already registered" });
    }

    const cleanFirstName = String(firstName).trim();
    const cleanLastName = String(lastName).trim();
    const { raw, hash, expires } = generateEmailVerificationToken();
    const user = await User.create({
      email: normalizedEmail,
      password,
      firstName: cleanFirstName,
      lastName: cleanLastName,
      fullName: [cleanFirstName, cleanLastName].filter(Boolean).join(" ").trim(),
      phone: String(phone || "").trim(),
      role: "utilisateur",
      emailVerified: false,
      emailVerifyTokenHash: hash,
      emailVerifyExpires: expires,
      lastVerifyEmailSentAt: new Date(),
    });

    await sendVerificationEmail(user, raw);
    const timestamp = new Date().toLocaleString("fr-TN");
    await sendEmail({
      to: user.email,
      ...buildSignupConfirmationEmail({
        user,
        timestamp,
        ip: getClientIp(req),
        userAgent: req.headers["user-agent"] || null,
      }),
    });

    await createAuditLog({
      actorId: user._id,
      action: "auth.signup",
      targetType: "user",
      targetId: user._id,
      after: { email: user.email, role: user.role, phone: user.phone },
      req,
    });

    return res.status(201).json({
      success: true,
      message: "Compte créé. Vérifie ton email pour activer le compte.",
      user: user.toJSON(),
    });
  } catch (error) {
    console.log("REGISTER ERROR:", error);
    return res.status(500).json({ success: false, message: "Error in Register API", error: error.message });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password required" });
    }

    const user = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ success: false, message: "Invalid email or password" });
    }

    const upgradeLegacy = needsLegacyUpgrade(user);
    const derived = deriveNamesFromUser(user);
    if (!String(user.firstName || "").trim()) user.firstName = derived.firstName;
    if (!String(user.lastName || "").trim()) user.lastName = derived.lastName;
    if (!String(user.fullName || "").trim()) user.fullName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();

    if (!user.emailVerified && !upgradeLegacy) {
      const { raw, hash, expires } = generateEmailVerificationToken();
      user.emailVerifyTokenHash = hash;
      user.emailVerifyExpires = expires;
      user.lastVerifyEmailSentAt = new Date();
      await user.save();

      await sendVerificationEmail(user, raw);

      return res.status(403).json({
        success: false,
        message: "Email non vérifié. Un email de vérification vient d'être envoyé.",
      });
    }

    if (!user.emailVerified && upgradeLegacy) {
      user.emailVerified = true;
      user.emailVerifyTokenHash = null;
      user.emailVerifyExpires = null;
    }

    user.lastLoginAt = new Date();
    user.lastLoginIp = getClientIp(req);
    user.lastLoginUserAgent = req.headers["user-agent"] || null;
    await user.save();

    if (user.notificationPreferences?.emailOnLogin ?? true) {
      await sendEmail({
        to: user.email,
        ...buildLoginSecurityEmail({
          user,
          timestamp: new Date().toLocaleString("fr-TN"),
          ip: user.lastLoginIp,
          userAgent: user.lastLoginUserAgent,
        }),
      });
    }

    await createAuditLog({
      actorId: user._id,
      action: "auth.login",
      targetType: "user",
      targetId: user._id,
      metadata: { ip: user.lastLoginIp, userAgent: user.lastLoginUserAgent },
      req,
    });

    return res.status(200).json({
      success: true,
      message: "Login Successfully",
      token: generateToken(user._id),
      user: user.toJSON(),
    });
  } catch (error) {
    console.log("LOGIN ERROR FULL:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getMe = async (req, res) => {
  return res.json({ success: true, user: req.user?.toJSON ? req.user.toJSON() : req.user });
};

export const verifyEmail = async (req, res) => {
  try {
    const { token, email } = req.query;
    if (!token || !email) {
      return res.status(400).json({ success: false, message: "Missing token or email" });
    }

    const user = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    if (user.emailVerified) {
      return res.json({ success: true, message: "Email déjà vérifié." });
    }

    if (!user.emailVerifyTokenHash || !user.emailVerifyExpires) {
      return res.status(400).json({ success: false, message: "No verification request found" });
    }

    if (user.emailVerifyExpires.getTime() < Date.now()) {
      return res.status(400).json({ success: false, message: "Token expiré. Refaire une demande de vérification." });
    }

    const hashed = hashToken(String(token));
    if (hashed !== user.emailVerifyTokenHash) {
      return res.status(400).json({ success: false, message: "Token invalide" });
    }

    user.emailVerified = true;
    user.emailVerifyTokenHash = null;
    user.emailVerifyExpires = null;
    if (!String(user.fullName || "").trim()) {
      user.fullName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
    }
    await user.save();

    await createAuditLog({
      actorId: user._id,
      action: "auth.verify_email",
      targetType: "user",
      targetId: user._id,
      req,
    });

    return res.json({ success: true, message: "Email vérifié avec succès. Tu peux te connecter." });
  } catch (e) {
    console.log("VERIFY EMAIL ERROR:", e);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const resendVerification = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: "Email required" });

    const user = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    if (user.emailVerified) {
      return res.json({ success: true, message: "Email déjà vérifié." });
    }

    const { raw, hash, expires } = generateEmailVerificationToken();
    user.emailVerifyTokenHash = hash;
    user.emailVerifyExpires = expires;
    user.lastVerifyEmailSentAt = new Date();
    if (!String(user.fullName || "").trim()) {
      user.fullName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
    }
    await user.save();

    await sendVerificationEmail(user, raw);

    return res.json({ success: true, message: "Email de vérification renvoyé." });
  } catch (e) {
    console.log("RESEND VERIFY ERROR:", e);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: "Email requis." });
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    if (user) {
      const { raw, hash, expires } = createPasswordResetToken();
      user.passwordResetTokenHash = hash;
      user.passwordResetExpires = expires;
      user.lastPasswordResetRequestedAt = new Date();
      if (!String(user.fullName || "").trim()) {
        user.fullName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
      }
      await user.save();
      await sendPasswordResetEmail(user, raw);

      await createAuditLog({
        actorId: user._id,
        action: "auth.password_reset_requested",
        targetType: "user",
        targetId: user._id,
        metadata: { ip: getClientIp(req) },
        req,
      });
    }

    return res.json({
      success: true,
      message: "Si un compte correspond à cet email, un lien de réinitialisation a été envoyé.",
    });
  } catch (e) {
    console.log("REQUEST PASSWORD RESET ERROR:", e);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const { email, token, newPassword } = req.body;

    if (!email || !token || !newPassword) {
      return res.status(400).json({ success: false, message: "Email, token et nouveau mot de passe sont requis." });
    }

    if (String(newPassword).length < 6) {
      return res.status(400).json({ success: false, message: "Le nouveau mot de passe doit contenir au moins 6 caractères." });
    }

    const user = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (!user) {
      return res.status(400).json({ success: false, message: "Demande de réinitialisation invalide ou expirée." });
    }

    if (!user.passwordResetTokenHash || !user.passwordResetExpires) {
      return res.status(400).json({ success: false, message: "Aucune demande de réinitialisation active." });
    }

    if (user.passwordResetExpires.getTime() < Date.now()) {
      return res.status(400).json({ success: false, message: "Le lien de réinitialisation a expiré. Merci d'en demander un nouveau." });
    }

    const hashed = hashToken(String(token));
    if (hashed !== user.passwordResetTokenHash) {
      return res.status(400).json({ success: false, message: "Token de réinitialisation invalide." });
    }

    user.password = String(newPassword);
    user.passwordResetTokenHash = null;
    user.passwordResetExpires = null;
    user.lastPasswordResetAt = new Date();
    await user.save();

    await sendEmail({
      to: user.email,
      ...buildPasswordResetSuccessEmail({
        user,
        timestamp: new Date().toLocaleString("fr-TN"),
        ip: getClientIp(req),
        userAgent: req.headers["user-agent"] || null,
      }),
    });

    await createAuditLog({
      actorId: user._id,
      action: "auth.password_reset_completed",
      targetType: "user",
      targetId: user._id,
      req,
    });

    return res.json({ success: true, message: "Mot de passe réinitialisé avec succès. Tu peux te connecter." });
  } catch (e) {
    console.log("RESET PASSWORD ERROR:", e);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
