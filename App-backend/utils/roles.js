// Only 2 roles exist: "admin" and "utilisateur"
// Legacy role names are mapped to one of these two.
export const ADMIN_SOURCE_ROLES = new Set(["admin", "administrator", "superviseur", "technicien"]);

export const VALID_ROLES = ["admin", "utilisateur"];

export function normalizeRole(role) {
  return ADMIN_SOURCE_ROLES.has(String(role || "").toLowerCase()) ? "admin" : "utilisateur";
}

export function isAdminRole(role) {
  return normalizeRole(role) === "admin";
}
