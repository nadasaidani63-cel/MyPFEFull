import AuditLog from "../models/AuditLog.js";

export async function createAuditLog({ actorId = null, action, targetType, targetId = null, before = null, after = null, metadata = null, req = null }) {
  try {
    await AuditLog.create({
      actorId,
      action,
      targetType,
      targetId: targetId ? String(targetId) : null,
      before,
      after,
      metadata,
      ip: req?.ip || req?.headers?.["x-forwarded-for"] || null,
      userAgent: req?.headers?.["user-agent"] || null,
    });
  } catch (error) {
    console.warn("Audit log skipped:", error?.message || error);
  }
}
