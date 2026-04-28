import mongoose from "mongoose";

const zoneSchema = new mongoose.Schema(
  {
    key: { type: String, default: null, unique: true, sparse: true },
    name: { type: String, required: true },
    description: { type: String, default: null },
    sourceType: {
      type: String,
      enum: ["managed", "simulated", "prototype"],
      default: "managed",
    },
    status: {
      type: String,
      enum: ["normal", "warning", "alert", "critical"],
      default: "normal",
    },
    datacenterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Datacenter",
      required: true,
    },

    // nouveaux champs optionnels
    part: { type: String, default: null },       // Partie 1 / Partie 2
    room: { type: String, default: null },       // Salle C0 / B0 / A0 ...
    roomPart: { type: String, default: null },   // Partie 1 de B0 / Partie 2 de B0
    displayOrder: { type: Number, default: 0 },  // ordre d'affichage
  },
  { timestamps: true }
);

export default mongoose.model("Zone", zoneSchema);
