import mongoose from "mongoose";

const nodeSchema = new mongoose.Schema(
  {
    key: { type: String, default: null, unique: true, sparse: true },
    name: { type: String, required: true },
    sourceType: {
      type: String,
      enum: ["managed", "simulated", "prototype"],
      default: "managed",
    },
    externalNodeId: { type: String, default: null, unique: true, sparse: true },
    zoneId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Zone",
      required: true,
    },
    isOnline: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ["normal", "warning", "alert", "critical"],
      default: "normal",
    },
    lastPing: { type: Date, default: null },
    macAddress: { type: String, default: null },
    firmwareVersion: { type: String, default: null },
  },
  { timestamps: true }
);

export default mongoose.model("Node", nodeSchema);
