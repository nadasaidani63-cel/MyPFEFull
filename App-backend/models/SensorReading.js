import mongoose from "mongoose";

const sensorReadingSchema = new mongoose.Schema({
  nodeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Node",
    required: true,
  },
  temperature: { type: Number, default: null },
  humidity: { type: Number, default: null },
  gasLevel: { type: Number, default: null },
  pressure: { type: Number, default: null },
  vibration: { type: Number, default: null },
  recordedAt: { type: Date, default: Date.now },
});

// index for fast queries on nodeId + recordedAt
sensorReadingSchema.index({ nodeId: 1, recordedAt: -1 });

export default mongoose.model("SensorReading", sensorReadingSchema);
