import mongoose from "mongoose";

const nodeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
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
