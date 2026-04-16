import mongoose from "mongoose";

const roleElevationRequestSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
    requestedAt: { type: Date, default: Date.now },
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reason: { type: String, default: "" },
    decisionNote: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model("RoleElevationRequest", roleElevationRequestSchema);
