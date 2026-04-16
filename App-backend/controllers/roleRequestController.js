import RoleElevationRequest from "../models/RoleElevationRequest.js";
import User from "../models/User.js";
import { createAuditLog } from "../services/auditLog.js";

export const createRoleRequest = async (req, res) => {
  try {
    const existing = await RoleElevationRequest.findOne({ userId: req.user._id, status: "pending" });
    if (existing) {
      return res.status(400).json({ success: false, message: "Une demande est déjà en attente." });
    }

    const request = await RoleElevationRequest.create({
      userId: req.user._id,
      reason: String(req.body.reason || "").trim(),
    });

    await createAuditLog({
      actorId: req.user._id,
      action: "role_request.create",
      targetType: "role_request",
      targetId: request._id,
      after: request.toObject(),
      req,
    });

    res.status(201).json({ success: true, data: request });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error creating role request", error: error.message });
  }
};

export const getRoleRequests = async (req, res) => {
  try {
    const filter = req.user.role === "admin" ? {} : { userId: req.user._id };
    const requests = await RoleElevationRequest.find(filter)
      .sort({ createdAt: -1 })
      .populate("userId", "firstName lastName email role")
      .populate("reviewedBy", "firstName lastName email role");

    res.json({ success: true, data: requests });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching role requests", error: error.message });
  }
};

async function reviewRequest(req, res, nextStatus) {
  const roleRequest = await RoleElevationRequest.findById(req.params.id).populate("userId");
  if (!roleRequest) return res.status(404).json({ success: false, message: "Request not found" });
  if (roleRequest.status !== "pending") {
    return res.status(400).json({ success: false, message: "Cette demande a déjà été traitée." });
  }

  roleRequest.status = nextStatus;
  roleRequest.reviewedAt = new Date();
  roleRequest.reviewedBy = req.user._id;
  roleRequest.decisionNote = String(req.body.decisionNote || "").trim();
  await roleRequest.save();

  if (nextStatus === "approved") {
    const user = await User.findById(roleRequest.userId._id);
    if (user) {
      user.role = "admin";
      await user.save();
    }
  }

  await createAuditLog({
    actorId: req.user._id,
    action: `role_request.${nextStatus}`,
    targetType: "role_request",
    targetId: roleRequest._id,
    after: roleRequest.toObject(),
    req,
  });

  res.json({ success: true, data: roleRequest });
}

export const approveRoleRequest = async (req, res) => {
  try {
    await reviewRequest(req, res, "approved");
  } catch (error) {
    res.status(500).json({ success: false, message: "Error approving role request", error: error.message });
  }
};

export const rejectRoleRequest = async (req, res) => {
  try {
    await reviewRequest(req, res, "rejected");
  } catch (error) {
    res.status(500).json({ success: false, message: "Error rejecting role request", error: error.message });
  }
};
