import User from "../models/User.js";
import { normalizeRole, isAdminRole } from "../utils/roles.js";
import { createAuditLog } from "../services/auditLog.js";

export const getUsers = async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    res.json({
      success: true,
      data: users.map((user) => user.toJSON()),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching users", error: error.message });
  }
};

export const getMyProfile = async (req, res) => {
  res.json({ success: true, data: req.user.toJSON() });
};

export const updateMyProfile = async (req, res) => {
  try {
    const allowedFields = ["firstName", "lastName", "email", "phone", "preferredLanguage", "notificationPreferences"];
    const before = req.user.toJSON();

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        if (field === "email") req.user[field] = String(req.body[field]).toLowerCase().trim();
        else if (field === "notificationPreferences") req.user.notificationPreferences = {
          ...req.user.notificationPreferences,
          ...req.body.notificationPreferences,
        };
        else req.user[field] = req.body[field];
      }
    }

    await req.user.save();

    await createAuditLog({
      actorId: req.user._id,
      action: "profile.update",
      targetType: "user",
      targetId: req.user._id,
      before,
      after: req.user.toJSON(),
      req,
    });

    res.json({ success: true, data: req.user.toJSON() });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error updating profile", error: error.message });
  }
};

export const updateUserRole = async (req, res) => {
  try {
    const role = normalizeRole(req.body.role);
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const before = user.toJSON();
    user.role = role;
    await user.save();

    await createAuditLog({
      actorId: req.user._id,
      action: "user.role_update",
      targetType: "user",
      targetId: user._id,
      before,
      after: user.toJSON(),
      req,
    });

    res.json({ success: true, data: user.toJSON() });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error updating user role", error: error.message });
  }
};

export const deleteUser = async (req, res) => {
  try {
    if (req.user._id.toString() === req.params.id) {
      return res.status(400).json({ success: false, message: "Cannot delete yourself" });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    await User.findByIdAndDelete(req.params.id);
    await createAuditLog({
      actorId: req.user._id,
      action: "user.delete",
      targetType: "user",
      targetId: req.params.id,
      before: user.toJSON(),
      req,
    });

    res.json({ success: true, message: "User deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error deleting user", error: error.message });
  }
};
