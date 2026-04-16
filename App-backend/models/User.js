import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { normalizeRole } from "../utils/roles.js";

function splitFullName(fullName = "") {
  const clean = String(fullName || "").trim().replace(/\s+/g, " ");
  if (!clean) return { firstName: "", lastName: "" };

  const parts = clean.split(" ");
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };

  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts.slice(-1).join(" "),
  };
}

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    // Keep first/last name optional at schema level for backward compatibility with legacy users
    // that only have the historical `fullName` field in MongoDB.
    firstName: { type: String, default: "", trim: true },
    lastName: { type: String, default: "", trim: true },
    // Legacy field kept intentionally so old accounts can still log in without a DB migration.
    fullName: { type: String, default: "", trim: true },
    phone: { type: String, default: "", trim: true },
    role: {
      type: String,
      enum: ["admin", "utilisateur", "administrator", "superviseur", "technicien"],
      default: "utilisateur",
    },
    preferredLanguage: {
      type: String,
      enum: ["fr", "en"],
      default: "fr",
    },
    notificationPreferences: {
      emailOnSignup: { type: Boolean, default: true },
      emailOnLogin: { type: Boolean, default: true },
      emailOnAlert: { type: Boolean, default: true },
      criticalOnly: { type: Boolean, default: false },
      aiNotifications: { type: Boolean, default: true },
    },
    avatarUrl: { type: String, default: null },
    emailVerified: { type: Boolean, default: false },
    emailVerifyTokenHash: { type: String, default: null },
    emailVerifyExpires: { type: Date, default: null },
    lastVerifyEmailSentAt: { type: Date, default: null },
    passwordResetTokenHash: { type: String, default: null },
    passwordResetExpires: { type: Date, default: null },
    lastPasswordResetRequestedAt: { type: Date, default: null },
    lastPasswordResetAt: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
    lastLoginIp: { type: String, default: null },
    lastLoginUserAgent: { type: String, default: null },
  },
  { timestamps: true }
);

userSchema.pre("save", async function (next) {
  // Always normalize role — handles legacy users with "administrator" / "superviseur"
  // even when the role field itself wasn't explicitly modified in this save call.
  const normalized = normalizeRole(this.role);
  if (this.role !== normalized) {
    this.role = normalized;
  }

  const hasFirst = String(this.firstName || "").trim().length > 0;
  const hasLast = String(this.lastName || "").trim().length > 0;
  const hasFull = String(this.fullName || "").trim().length > 0;

  if ((!hasFirst || !hasLast) && hasFull) {
    const parsed = splitFullName(this.fullName);
    if (!hasFirst && parsed.firstName) this.firstName = parsed.firstName;
    if (!hasLast && parsed.lastName) this.lastName = parsed.lastName;
  }

  if (this.isModified("firstName") || this.isModified("lastName") || !String(this.fullName || "").trim()) {
    this.fullName = [this.firstName, this.lastName].filter(Boolean).join(" ").trim();
  }

  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.emailVerifyTokenHash;
  delete obj.emailVerifyExpires;
  delete obj.passwordResetTokenHash;
  delete obj.passwordResetExpires;
  obj.role = normalizeRole(obj.role);

  const hasFirst = String(obj.firstName || "").trim().length > 0;
  const hasLast = String(obj.lastName || "").trim().length > 0;

  if ((!hasFirst || !hasLast) && obj.fullName) {
    const parsed = splitFullName(obj.fullName);
    if (!hasFirst) obj.firstName = parsed.firstName;
    if (!hasLast) obj.lastName = parsed.lastName;
  }

  obj.firstName = String(obj.firstName || "").trim();
  obj.lastName = String(obj.lastName || "").trim();
  obj.fullName = [obj.firstName, obj.lastName].filter(Boolean).join(" ").trim() || String(obj.fullName || "").trim();
  return obj;
};

export default mongoose.model("User", userSchema);
