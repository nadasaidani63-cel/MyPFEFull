import mongoose from "mongoose";

const datacenterSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    location: { type: String, default: null },
    status: {
      type: String,
      enum: ["normal", "warning", "alert", "critical"],
      default: "normal",
    },
  },
  { timestamps: true }
);

export default mongoose.model("Datacenter", datacenterSchema);
