import mongoose from "mongoose";

const alertThresholdSchema = new mongoose.Schema(
  {
    scopeType: {
      type: String,
      enum: ["datacenter", "zone", "node"],
      required: true,
    },
    scopeId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    metricName: {
      type: String,
      enum: ["temperature", "humidity", "pressure", "vibration", "gasLevel"],
      required: true,
    },
    warningMin: { type: Number, default: null },
    warningMax: { type: Number, default: null },
    alertMin: { type: Number, default: null },
    alertMax: { type: Number, default: null },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true }
);

alertThresholdSchema.index({ scopeType: 1, scopeId: 1, metricName: 1 }, { unique: true });

alertThresholdSchema.methods.toJSON = function () {
  const obj = this.toObject();
  obj.zoneId = obj.scopeType === "zone" ? obj.scopeId : undefined;
  obj.minValue = obj.warningMin;
  obj.maxValue = obj.warningMax;
  return obj;
};

export default mongoose.model("AlertThreshold", alertThresholdSchema);
