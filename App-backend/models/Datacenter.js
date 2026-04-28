import mongoose from "mongoose";

const datacenterSchema = new mongoose.Schema(
  {
    key: { type: String, default: null, unique: true, sparse: true },
    name: { type: String, required: true },
    location: { type: String, default: null },
    sourceType: {
      type: String,
      enum: ["managed", "simulated", "prototype"],
      default: "managed",
    },
    displayOrder: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["normal", "warning", "alert", "critical"],
      default: "normal",
    },
  },
  { timestamps: true }
);

export default mongoose.model("Datacenter", datacenterSchema);
